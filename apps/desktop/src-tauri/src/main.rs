#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cookie::Cookie;
use reqwest::{header, Client, Method, Url};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{Manager, State, menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tokio::sync::Mutex;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServiceConfig { api_url: String, web_origin: String }
#[derive(Clone, Serialize, Deserialize)]
struct Session { cookie: String, expires: Option<i64> }
struct Connection { config: Option<ServiceConfig>, session: Option<Session> }
struct AppState { connection: Mutex<Connection>, client: Client, config_file: PathBuf }
#[derive(Deserialize)]
struct Upload { name: String, mime: String, bytes: Vec<u8> }
#[derive(Deserialize)]
struct ApiRequest { path: String, method: String, csrf: String, body: Option<serde_json::Value>, upload: Option<Upload> }
#[derive(Serialize)]
struct ApiResponse { status: u16, data: serde_json::Value }

fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64 }
fn credential(config: &ServiceConfig) -> Result<keyring::Entry, String> {
    keyring::Entry::new("Warp Desktop", &config.api_url).map_err(|_| "Armazenamento seguro indisponível.".into())
}
fn clear_saved(config: &ServiceConfig) -> Result<(), String> {
    match credential(config)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Não foi possível remover a sessão do Windows.".into()),
    }
}
fn normalize_origin(value: &str) -> Result<String, String> {
    let url = Url::parse(value.trim()).map_err(|_| "Endereço inválido.")?;
    let local = cfg!(debug_assertions) && url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
    if !(url.scheme() == "https" || local) || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err("Use um endereço HTTPS sem caminho, credenciais ou parâmetros.".into());
    }
    Ok(url.origin().ascii_serialization())
}
fn valid_request(path: &str, method: &str) -> bool {
    (path.starts_with("/v1/auth/") || path.starts_with("/v1/users/"))
        && !path.contains("..") && !path.contains(['?', '#', '%', '\\'])
        && matches!(method, "GET" | "POST" | "PATCH" | "DELETE")
}
#[tauri::command]
async fn get_service(state: State<'_, AppState>) -> Result<Option<ServiceConfig>, String> {
    Ok(state.connection.lock().await.config.clone())
}
#[tauri::command]
async fn configure_service(config: ServiceConfig, state: State<'_, AppState>) -> Result<(), String> {
    let config = ServiceConfig { api_url: normalize_origin(&config.api_url)?, web_origin: normalize_origin(&config.web_origin)? };
    let mut connection = state.connection.lock().await;
    // Check the target before saving. No existing cookies or tokens are sent to this host.
    let health = state.client.get(format!("{}/health", config.api_url)).send().await.map_err(|_| "Não foi possível acessar a API.")?;
    if !health.status().is_success() { return Err("A API não respondeu ao teste de conexão.".into()); }
    if let Some(old) = &connection.config { clear_saved(old)?; }
    fs::write(&state.config_file, serde_json::to_vec(&config).map_err(|_| "Configuração inválida.")?).map_err(|_| "Não foi possível salvar a conexão.")?;
    connection.config = Some(config);
    connection.session = None;
    Ok(())
}
#[tauri::command]
async fn api_request(request: ApiRequest, state: State<'_, AppState>) -> Result<ApiResponse, String> {
    if !valid_request(&request.path, &request.method) { return Err("Requisição inválida.".into()); }
    let mut connection = state.connection.lock().await;
    let config = connection.config.clone().ok_or("Configure a conexão com a API.")?;
    if connection.session.as_ref().is_some_and(|s| s.expires.is_some_and(|v| v <= now())) {
        clear_saved(&config)?; connection.session = None;
    }
    let mut builder = state.client.request(Method::from_bytes(request.method.as_bytes()).map_err(|_| "Método inválido.")?, format!("{}{}", config.api_url, request.path))
        .header(header::ORIGIN, &config.web_origin).header("X-Warp-Client", "web");
    if !request.csrf.is_empty() { builder = builder.header("X-CSRF-Token", &request.csrf); }
    if let Some(session) = &connection.session { builder = builder.header(header::COOKIE, &session.cookie); }
    if let Some(upload) = request.upload {
        if request.path != "/v1/users/me/avatar" || request.method != "POST" || upload.bytes.len() > 2 * 1024 * 1024 || !matches!(upload.mime.as_str(), "image/png" | "image/jpeg" | "image/webp") {
            return Err("Imagem inválida. Use PNG, JPG ou WebP até 2 MB.".into());
        }
        let part = reqwest::multipart::Part::bytes(upload.bytes).file_name(upload.name).mime_str(&upload.mime).map_err(|_| "Formato inválido.")?;
        builder = builder.multipart(reqwest::multipart::Form::new().part("avatar", part));
    } else if let Some(body) = request.body { builder = builder.json(&body); }
    let response = builder.send().await.map_err(|_| "Falha na conexão com a API.")?;
    let status = response.status().as_u16();
    for value in response.headers().get_all(header::SET_COOKIE) {
        let Ok(text) = value.to_str() else { continue };
        let Ok(cookie) = Cookie::parse(text) else { continue };
        if !matches!(cookie.name(), "__Host-warp_session" | "warp_session") { continue; }
        let expires = cookie.expires_datetime().map(|v| v.unix_timestamp());
        if cookie.value().is_empty() || expires.is_some_and(|v| v <= now()) || cookie.max_age().is_some_and(|v| v.whole_seconds() <= 0) {
            clear_saved(&config)?; connection.session = None;
        } else {
            let session = Session { cookie: format!("{}={}", cookie.name(), cookie.value()), expires };
            if expires.is_some() {
                credential(&config)?.set_password(&serde_json::to_string(&session).map_err(|_| "Sessão inválida.")?).map_err(|_| "Não foi possível salvar a sessão com segurança no Windows.")?;
            } else { clear_saved(&config)?; }
            connection.session = Some(session);
        }
    }
    let data = response.json().await.map_err(|_| "Resposta inválida da API.")?;
    Ok(ApiResponse { status, data })
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let folder = app.path().app_data_dir()?; fs::create_dir_all(&folder)?;
            let config_file = folder.join("connection.json");
            let config: Option<ServiceConfig> = fs::read(&config_file).ok().and_then(|data| serde_json::from_slice(&data).ok()).filter(|c: &ServiceConfig| normalize_origin(&c.api_url).is_ok() && normalize_origin(&c.web_origin).is_ok());
            let session: Option<Session> = config.as_ref().and_then(|c| credential(c).ok()).and_then(|entry| entry.get_password().ok()).and_then(|v| serde_json::from_str(&v).ok()).filter(|s: &Session| s.expires.is_some_and(|v| v > now()));
            let client = Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).user_agent("Warp Desktop/0.1.0 Windows").build()?;
            app.manage(AppState { connection: Mutex::new(Connection { config, session }), client, config_file });
            let show = MenuItem::with_id(app, "show", "Abrir Warp", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("Warp").menu(&menu).on_menu_event(|app, event| {
                match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus(); },
                    _ => {}
                }
            }).build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
        })
        .invoke_handler(tauri::generate_handler![get_service, configure_service, api_request])
        .run(tauri::generate_context!()).expect("Não foi possível iniciar o Warp");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn windows_credential_roundtrip() {
        let name = format!("warp-test-{}-{}", std::process::id(), now());
        let entry = keyring::Entry::new("Warp Desktop Tests", &name).unwrap();
        entry.set_password("temporary-test-session").unwrap();
        let read = keyring::Entry::new("Warp Desktop Tests", &name).unwrap().get_password();
        entry.delete_credential().unwrap();
        assert_eq!(read.unwrap(), "temporary-test-session");
        assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    }
    #[test] fn restrict_origins_and_paths() {
        assert_eq!(normalize_origin("https://warp.example/").unwrap(), "https://warp.example");
        for url in ["http://example.com", "https://user:pass@example.com", "https://example.com/v1", "https://example.com/?token=x", "file:///etc/passwd"] { assert!(normalize_origin(url).is_err()); }
        assert!(valid_request("/v1/auth/me", "GET"));
        for path in ["//evil.com", "/v1/auth/../../admin", "/v1/auth/%2e%2e/admin", "/health"] { assert!(!valid_request(path, "GET")); }
        assert!(!valid_request("/v1/auth/me", "PUT"));
    }
}
