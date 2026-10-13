import { useState, type FormEvent, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { WarpMark, Button } from '@warp/ui';
import '../../web/src/styles.css';
import './desktop.css';

type Service = { apiUrl: string; webOrigin: string };
async function activate(service: Service) {
  window.__WARP_DESKTOP__ = {
    apiUrl: service.apiUrl,
    async request(path, method, csrf, body) {
      let upload = null;
      if (body instanceof FormData) {
        const file = body.get('avatar');
        if (!(file instanceof File)) throw new Error('Arquivo inválido.');
        upload = { name: file.name, mime: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) };
        body = null;
      }
      return invoke('api_request', { request: { path, method, csrf, body: body ?? null, upload } });
    },
  };
  return (await import('../../web/src/App')).App;
}
function Desktop({ service, initialApp }: { service: Service | null; initialApp: ComponentType | null }) {
  const [App] = useState(() => initialApp);
  const [settings, setSettings] = useState(!service);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const fields = new FormData(event.currentTarget);
    try {
      await invoke('configure_service', { config: { apiUrl: fields.get('apiUrl'), webOrigin: fields.get('webOrigin') } });
      window.location.replace('/');
    } catch (e) { setError(String(e)); }
  }
  async function notify() {
    let allowed = await isPermissionGranted();
    if (!allowed) allowed = await requestPermission() === 'granted';
    if (allowed) sendNotification({ title: 'Warp', body: 'Notificações do Windows ativadas.' });
    else setError('Permita as notificações nas configurações do Windows.');
  }
  return <><header className="desktop-toolbar"><span>WARP · WINDOWS</span><button onClick={() => setSettings(!settings)}>{settings && App ? 'Voltar à conta' : 'Conexão'}</button></header>
    {settings ? <main className="desktop-setup"><WarpMark /><h1>Conecte seu Warp</h1><p>Use os endereços públicos da API no Railway e do site na Vercel. Todos os dispositivos devem usar a mesma API.</p><form onSubmit={save}>
      <label className="field">Endereço da API<input name="apiUrl" type="url" placeholder="https://sua-api.up.railway.app" defaultValue={service?.apiUrl} required /></label>
      <label className="field">Endereço do site<input name="webOrigin" type="url" placeholder="https://seu-warp.vercel.app" defaultValue={service?.webOrigin} required /></label>
      {error && <p role="alert">{error}</p>}<Button type="submit">Salvar conexão</Button></form><button onClick={notify}>Testar notificação</button><p>Ao fechar a janela, o Warp fica na bandeja. Para encerrar, use Sair no ícone da bandeja.</p></main> : App && <App />}</>;
}
async function main() {
  const service = await invoke<Service | null>('get_service');
  const App = service ? await activate(service) : null;
  createRoot(document.getElementById('root')!).render(<Desktop service={service} initialApp={App} />);
}
main().catch(() => { document.getElementById('root')!.textContent = 'Não foi possível iniciar o Warp. Reabra o aplicativo.'; });
