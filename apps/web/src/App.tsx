import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Fingerprint,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Monitor,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { WarpMark, Button } from '@warp/ui';
import {
  registerSchema,
  type AuthResponse,
  type SessionInfo,
  type UserProfile,
} from '@warp/shared';
import { api, API_URL, RequestError, renewSession, setCsrf } from './api';
import { Community } from './Community';

type Route = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email';
type View = 'overview' | 'profile' | 'security' | 'sessions';
const initialRoute = window.location.pathname.slice(1) as Route;
const inviteCode = new URLSearchParams(window.location.search).get('invite');
const initialToken = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
const statuses = { ONLINE: 'Disponível', AWAY: 'Ausente', BUSY: 'Ocupado', INVISIBLE: 'Invisível' };
const date = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const formData = (event: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(event.currentTarget));
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Password({
  name = 'password',
  label = 'Senha',
  autoComplete = 'current-password',
  minLength = 1,
}: {
  name?: string;
  label?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <span className="password-wrap">
        <input
          name={name}
          type={show ? 'text' : 'password'}
          required
          minLength={minLength}
          maxLength={128}
          autoComplete={autoComplete}
          placeholder={minLength === 12 ? 'Pelo menos 12 caracteres' : 'Sua senha'}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </Field>
  );
}
function Notice({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
function Avatar({ user, large = false }: { user: UserProfile; large?: boolean }) {
  return (
    <span className={`avatar ${large ? 'large' : ''}`}>
      {user.avatarUrl ? (
        <img src={`${API_URL}${user.avatarUrl}`} alt={`Avatar de ${user.displayName}`} />
      ) : (
        user.displayName.slice(0, 2).toUpperCase()
      )}
      <i className={`presence ${user.status.toLowerCase()}`} />
    </span>
  );
}

export function App() {
  const [community, setCommunity] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null),
    [loading, setLoading] = useState(true),
    [connectionError, setConnectionError] = useState('');
  const [route, setRoute] = useState<Route>(
    ['register', 'forgot-password', 'reset-password', 'verify-email'].includes(initialRoute)
      ? initialRoute
      : 'login',
  );
  const [view, setView] = useState<View>('overview');
  const [feedback, setFeedback] = useState('');
  const navigate = (next: Route) => {
    setRoute(next);
    setFeedback('');
    window.history.pushState(null, '', (next === 'login' ? '/' : `/${next}`) + (inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : ''));
  };
  const load = async () => {
    setLoading(true);
    setConnectionError('');
    try {
      const auth = await api<AuthResponse>('/auth/me');
      setUser(auth.user);
    } catch (e) {
      if (!(e instanceof RequestError && e.status === 401))
        setConnectionError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const onPop = () => setRoute((window.location.pathname.slice(1) || 'login') as Route);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      void renewSession()
        .then((a) => setUser(a.user))
        .catch((e) => {
          if (e instanceof RequestError && e.status === 401) {
            setUser(null);
            setFeedback('Sua sessão expirou. Entre novamente.');
          }
        });
    }, 30 * 60_000);
    return () => clearInterval(timer);
  }, [user?.id]);
  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setCsrf('');
      setUser(null);
      navigate('login');
    } catch (e) {
      setFeedback((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="loading-screen">
        <WarpMark width={56} />
        <LoaderCircle className="spin" />
        <p>Conectando seu espaço</p>
      </div>
    );
  if (user && community && !['reset-password', 'verify-email'].includes(route))
    return <Community user={user} onAccount={() => setCommunity(false)} onLogout={() => void signOut()} />;
  if (user && !['reset-password', 'verify-email'].includes(route))
    return (
      <div className="app-shell">
        <aside className="rail">
          <a
            href="/"
            aria-label="Warp início"
            onClick={(e) => {
              e.preventDefault();
              setView('overview');
            }}
            className="rail-logo"
          >
            <WarpMark width={31} />
          </a>
          <span className="rail-divider" />
          <button
            className="rail-button selected"
            aria-label="Meu espaço"
            onClick={() => setView('overview')}
          >
            <LayoutDashboard size={22} />
          </button>
          <div className="rail-bottom">
            <button
              className="rail-button"
              aria-label="Configurações do perfil"
              onClick={() => setView('profile')}
            >
              <Settings2 size={21} />
            </button>
            <Avatar user={user} />
          </div>
        </aside>
        <aside className="sidebar">
          <div className="sidebar-title">
            Meu espaço <span className="tiny-label">PESSOAL</span>
          </div>
          <p className="nav-caption">SUA CONTA</p>
          <nav>
            <button onClick={() => setCommunity(true)}><Radio size={18}/> Servidores e conversas</button>
            {(
              [
                { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
                { id: 'profile', label: 'Meu perfil', icon: UserRound },
                { id: 'security', label: 'Segurança', icon: ShieldCheck },
                { id: 'sessions', label: 'Dispositivos', icon: Monitor },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                className={view === item.id ? 'active' : ''}
                onClick={() => {
                  setView(item.id);
                  setFeedback('');
                }}
              >
                <item.icon size={18} />
                {item.label}
                {view === item.id && <ChevronRight size={16} />}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="eyebrow">FEITO PARA CONECTAR</span>
            <p>Boas conversas começam com você.</p>
            <div className="mini-orbit">
              <WarpMark width={33} />
            </div>
          </div>
          <div className="sidebar-user">
            <Avatar user={user} />
            <div>
              <strong>{user.displayName}</strong>
              <small>@{user.username}</small>
            </div>
            <button
              className="icon-button"
              onClick={() => void signOut()}
              aria-label="Sair da conta"
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <main className="workspace">
          <header className="workspace-header">
            <span>
              <span className="muted">Meu espaço</span>
              <ChevronRight size={14} />
              {
                {
                  overview: 'Visão geral',
                  profile: 'Meu perfil',
                  security: 'Segurança',
                  sessions: 'Dispositivos',
                }[view]
              }
            </span>
            <span className="secure-label">
              <i /> Conectado à sua conta
            </span>
            <button
              className="icon-button mobile-logout"
              onClick={() => void signOut()}
              aria-label="Sair da conta"
            >
              <LogOut size={18} />
            </button>
          </header>
          <nav className="mobile-nav" aria-label="Sua conta">
            {(
              [
                { id: 'overview', label: 'Início' },
                { id: 'profile', label: 'Perfil' },
                { id: 'security', label: 'Segurança' },
                { id: 'sessions', label: 'Dispositivos' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                className={view === item.id ? 'active' : ''}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="workspace-content">
            {feedback && <Notice>{feedback}</Notice>}
            {view === 'overview' ? (
              <>
                <div className="page-title">
                  <div>
                    <p className="eyebrow">SEU PONTO DE ENCONTRO</p>
                    <h1>
                      Olá, {user.displayName.split(' ')[0]}
                      <span className="purple">.</span>
                    </h1>
                    <p>Seu espaço está pronto. Deixe ele com a sua cara.</p>
                  </div>
                  <span className="version-pill">WARP / 01</span>
                </div>
                <section className="welcome-card">
                  <div>
                    <span className="pill">
                      <Sparkles size={13} /> UM NOVO ESPAÇO PARA VOCÊ
                    </span>
                    <h2>
                      Mais perto.
                      <br />
                      Do seu jeito.
                    </h2>
                    <p>
                      Uma identidade, todas as suas conexões.
                      <br />
                      Comece pelo que torna seu perfil único.
                    </p>
                    <Button onClick={() => setView('profile')}>
                      Personalizar meu perfil <ArrowUpRight size={17} />
                    </Button>
                  </div>
                  <div className="dashboard-orbit">
                    <div />
                    <div />
                    <div />
                    <WarpMark width={96} />
                    <span className="orbit-dot one" />
                    <span className="orbit-dot two" />
                  </div>
                </section>
                <div className="section-heading">
                  <h2>Sua conta, sob controle</h2>
                  <span>Simples. Pessoal. Seu.</span>
                </div>
                <div className="summary-grid">
                  <button className="summary-card" onClick={() => setView('profile')}>
                    <span className="card-icon">
                      <UserRound />
                    </span>
                    <ArrowUpRight className="card-arrow" size={18} />
                    <h3>Seu perfil</h3>
                    <p>
                      Nome, avatar e presença.
                      <br />
                      Mostre quem você é.
                    </p>
                    <span className="card-link">
                      Editar perfil <ArrowRight size={15} />
                    </span>
                  </button>
                  <button className="summary-card" onClick={() => setView('security')}>
                    <span className="card-icon green">
                      <ShieldCheck />
                    </span>
                    <ArrowUpRight className="card-arrow" size={18} />
                    <h3>Segurança</h3>
                    <p>
                      {user.emailVerified
                        ? 'Seu e-mail está verificado.'
                        : 'Confirme seu e-mail para proteger sua conta.'}
                    </p>
                    <span className={`card-link ${user.emailVerified ? 'green-text' : ''}`}>
                      {user.emailVerified ? 'E-mail verificado' : 'Verificar e-mail'}{' '}
                      <ArrowRight size={15} />
                    </span>
                  </button>
                  <button className="summary-card" onClick={() => setView('sessions')}>
                    <span className="card-icon blue">
                      <Monitor />
                    </span>
                    <ArrowUpRight className="card-arrow" size={18} />
                    <h3>Dispositivos</h3>
                    <p>Veja onde sua conta está conectada.</p>
                    <span className="card-link">
                      Gerenciar acessos <ArrowRight size={15} />
                    </span>
                  </button>
                </div>
                <div className="phase-note">
                  <Radio size={21} />
                  <div>
                    <strong>O começo de novas conexões</strong>
                    <p>Abra Amigos e conversas para falar com suas pessoas e criar servidores.</p>
                  </div>
                  <span>WARP 0.2</span>
                </div>
              </>
            ) : view === 'profile' ? (
              <Profile user={user} update={setUser} />
            ) : view === 'security' ? (
              <Security
                user={user}
                update={setUser}
                loggedOut={() => {
                  setUser(null);
                  setCsrf('');
                  navigate('login');
                  setFeedback('Senha alterada. Entre novamente.');
                }}
              />
            ) : (
              <Sessions
                loggedOut={() => {
                  setUser(null);
                  navigate('login');
                }}
              />
            )}
            <footer className="workspace-footer">
              <span>
                <WarpMark width={16} /> WARP
              </span>
              <span>Seu espaço. Suas conexões.</span>
            </footer>
          </div>
        </main>
      </div>
    );
  return (
    <div className="auth-shell">
      <section className="brand-panel">
        <a
          className="wordmark"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('login');
          }}
        >
          <WarpMark width={37} />
          WARP
        </a>
        <div className="brand-copy">
          <div className="eyebrow">
            <span className="dash" /> MENOS DISTÂNCIA. MAIS CONEXÃO.
          </div>
          <h1>
            Seu espaço.
            <br />
            Suas pessoas.
            <br />
            <span>Na mesma órbita.</span>
          </h1>
          <p>
            Um lugar para se encontrar, compartilhar
            <br className="desktop-break" /> e fazer parte de algo seu.
          </p>
        </div>
        <div className="warp-art" aria-hidden="true">
          <div className="orbit o1" />
          <div className="orbit o2" />
          <div className="orbit o3" />
          <div className="orbit o4" />
          <div className="orbit-core">
            <WarpMark width={90} />
          </div>
          <span className="orbit-dot one" />
          <span className="orbit-dot two" />
          <span className="star s1" />
          <span className="star s2" />
          <div className="art-tag">
            <span /> CONEXÕES REAIS
          </div>
        </div>
        <div className="brand-footer">
          <span>FEITO PARA ESTAR PERTO</span>
          <span>01 — ∞</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-top">
          <span>{route === 'register' ? 'Já está por aqui?' : 'Ainda não tem uma conta?'}</span>
          <button onClick={() => navigate(route === 'register' ? 'login' : 'register')}>
            {route === 'register' ? 'Entrar' : 'Criar conta'}
            <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="auth-content">
          {connectionError && (
            <Notice error>
              {connectionError}
              <button className="text-button" onClick={() => void load()}>
                Tentar novamente
              </button>
            </Notice>
          )}
          {feedback && <Notice>{feedback}</Notice>}
          <AuthForm
            route={route}
            navigate={navigate}
            signedIn={(a) => {
              setUser(a.user);
              setView('overview');
              navigate('login');
              if (a.mailSent === false)
                setFeedback(
                  'Conta criada. O envio do e-mail falhou; reenvie a verificação em Segurança.',
                );
            }}
            verified={async () => {
              setFeedback('E-mail confirmado.');
              if (user) {
                const a = await api<AuthResponse>('/auth/me');
                setUser(a.user);
              }
              navigate('login');
              setFeedback('E-mail confirmado com sucesso.');
            }}
          />
        </div>
        <div className="auth-bottom">
          <span>
            <ShieldCheck size={15} /> Seu espaço começa com uma conta segura.
          </span>
          <span>WARP © {new Date().getFullYear()}</span>
        </div>
      </section>
    </div>
  );
}

function AuthForm({
  route,
  navigate,
  signedIn,
  verified,
}: {
  route: Route;
  navigate: (r: Route) => void;
  signedIn: (a: AuthResponse & { mailSent?: boolean }) => void;
  verified: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    setError('');
    setMessage('');
  }, [route]);
  const copy = {
    login: ['BOM TER VOCÊ DE VOLTA', 'Entre na sua órbita.', 'Suas conexões começam aqui.'],
    register: [
      'SEU PRÓXIMO PONTO DE ENCONTRO',
      'Encontre seu espaço.',
      'Crie sua conta e faça parte do Warp.',
    ],
    'forgot-password': [
      'VAMOS RESOLVER',
      'Esqueceu a senha?',
      'Enviaremos um link para você voltar ao seu espaço.',
    ],
    'reset-password': [
      'UM NOVO COMEÇO',
      'Crie uma nova senha.',
      'Use uma senha única com pelo menos 12 caracteres.',
    ],
    'verify-email': [
      'SÓ MAIS UM PASSO',
      'Confirme seu e-mail.',
      'Confirme para manter sua conta protegida.',
    ],
  }[route] ?? ['', 'Entre na sua órbita.', ''];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = formData(event);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (route === 'login')
        signedIn(
          await api<AuthResponse>('/auth/login', {
            method: 'POST',
            body: {
              identifier: data.identifier,
              password: data.password,
              remember: data.remember === 'on',
            },
          }),
        );
      else if (route === 'register') {
        const payload = registerSchema.parse({ ...data, remember: data.remember === 'on' });
        const result = await api<AuthResponse & { mailSent: boolean }>('/auth/register', {
          method: 'POST',
          body: payload,
        });
        signedIn(result);
      } else if (route === 'forgot-password') {
        const r = await api<{ message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: { email: data.email },
        });
        setMessage(r.message);
      } else if (route === 'reset-password') {
        await api('/auth/reset-password', {
          method: 'POST',
          body: { token: initialToken, password: data.password },
        });
        setMessage('Senha redefinida. Todas as sessões foram encerradas. Você já pode entrar.');
      } else {
        await api('/auth/verify-email', { method: 'POST', body: { token: initialToken } });
        await verified();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="auth-symbol">
        <WarpMark width={28} />
      </span>
      <p className="eyebrow">{copy[0]}</p>
      <h2>{copy[1]}</h2>
      <p className="auth-description">{copy[2]}</p>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <form key={route} onSubmit={(e) => void submit(e)} className="auth-form">
        {route === 'register' && (
          <>
            <Field label="Como podemos chamar você?">
              <input
                name="displayName"
                autoComplete="name"
                maxLength={60}
                required
                placeholder="Seu nome"
              />
            </Field>
            <Field label="Username">
              <input
                name="username"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_]+"
                required
                placeholder="seu_username"
              />
            </Field>
          </>
        )}
        {route === 'login' && (
          <Field label="E-mail ou username">
            <input
              name="identifier"
              autoComplete="username"
              required
              maxLength={254}
              placeholder="voce@exemplo.com"
            />
          </Field>
        )}
        {(route === 'register' || route === 'forgot-password') && (
          <Field label="E-mail">
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="voce@exemplo.com"
            />
          </Field>
        )}
        {['login', 'register', 'reset-password'].includes(route) && (
          <Password
            minLength={route === 'login' ? 1 : 12}
            autoComplete={route === 'login' ? 'current-password' : 'new-password'}
          />
        )}
        {['login', 'register'].includes(route) && (
          <div className="form-options">
            <label className="checkbox">
              <input type="checkbox" name="remember" defaultChecked />
              Manter conectado
            </label>
            {route === 'login' && (
              <button
                type="button"
                className="text-button"
                onClick={() => navigate('forgot-password')}
              >
                Esqueci a senha
              </button>
            )}
          </div>
        )}
        {['verify-email', 'reset-password'].includes(route) && !initialToken ? (
          <Notice error>Este link não contém um token válido. Solicite um novo link.</Notice>
        ) : (
          <Button type="submit" className="primary full" disabled={busy || !!message}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                {
                  {
                    login: 'Entrar no Warp',
                    register: 'Criar minha conta',
                    'forgot-password': 'Enviar link de recuperação',
                    'reset-password': 'Salvar nova senha',
                    'verify-email': 'Confirmar e-mail',
                  }[route]
                }
                <ArrowRight size={18} />
              </>
            )}
          </Button>
        )}
      </form>
      {route === 'login' ? (
        <div className="auth-divider">
          <span />
          <LockKeyhole size={13} /> UM ESPAÇO QUE É SÓ SEU
          <span />
        </div>
      ) : (
        <button className="back-link" onClick={() => navigate('login')}>
          Voltar para entrar <ArrowRight size={15} />
        </button>
      )}
    </>
  );
}

function Profile({ user, update }: { user: UserProfile; update: (u: UserProfile) => void }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function run(action: () => Promise<{ user: UserProfile }>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      update((await action()).user);
      setMessage('Perfil atualizado.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">DO SEU JEITO</p>
          <h1>Meu perfil</h1>
          <p>É assim que você aparece no Warp.</p>
        </div>
      </div>
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      <div className="profile-layout">
        <section className="settings-card">
          <div className="avatar-editor">
            <Avatar user={user} large />
            <div>
              <h3>Imagem de perfil</h3>
              <p>PNG, JPEG ou WebP. Até 2 MB.</p>
              <label className={`button secondary upload-label ${busy ? 'disabled' : ''}`}>
                <Upload size={15} /> Alterar imagem
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setError('A imagem deve ter até 2 MB.');
                      return;
                    }
                    const data = new FormData();
                    data.append('avatar', file);
                    void run(() => api('/users/me/avatar', { method: 'POST', body: data }));
                    e.target.value = '';
                  }}
                />
              </label>
              {user.avatarUrl && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void run(() => api('/users/me/avatar', { method: 'DELETE' }))}
                >
                  Remover
                </button>
              )}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = formData(e);
              void run(() => api('/users/me', { method: 'PATCH', body: data }));
            }}
            className="settings-form"
          >
            <Field label="Nome de exibição">
              <input name="displayName" defaultValue={user.displayName} required maxLength={60} />
            </Field>
            <Field label="Sobre você">
              <textarea
                name="bio"
                defaultValue={user.bio}
                maxLength={240}
                rows={3}
                placeholder="Um pouco do seu universo."
              />
            </Field>
            <Field label="Presença">
              <select name="status" defaultValue={user.status}>
                {Object.entries(statuses).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-footer">
              <span>Seu username: @{user.username}</span>
              <Button className="primary" disabled={busy}>
                Salvar alterações
                <Check size={16} />
              </Button>
            </div>
          </form>
        </section>
        <aside className="profile-preview">
          <div className="preview-banner">
            <WarpMark width={58} />
          </div>
          <div className="preview-body">
            <Avatar user={user} large />
            <h2>{user.displayName}</h2>
            <span>@{user.username}</span>
            <p className="status-line">
              <i className={`presence ${user.status.toLowerCase()}`} />
              {statuses[user.status]}
            </p>
            <hr />
            <h4>SOBRE MIM</h4>
            <p>{user.bio || 'Seu universo ainda está por descobrir.'}</p>
            <h4>NO WARP DESDE</h4>
            <p>
              {new Date(user.createdAt).toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Security({
  user,
  update,
  loggedOut,
}: {
  user: UserProfile;
  update: (u: UserProfile) => void;
  loggedOut: () => void;
}) {
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">VOCÊ NO CONTROLE</p>
          <h1>Segurança</h1>
          <p>Cuide do acesso ao seu espaço.</p>
        </div>
        <ShieldCheck className="title-icon" />
      </div>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <section className="settings-card">
        <div className="setting-heading">
          <Mail />
          <div>
            <h3>E-mail da conta</h3>
            <p>{user.email}</p>
          </div>
          <span className={`badge ${user.emailVerified ? 'verified' : ''}`}>
            {user.emailVerified ? 'Verificado' : 'Não verificado'}
          </span>
        </div>
        {!user.emailVerified && (
          <div className="setting-actions">
            <Button
              disabled={busy}
              className="secondary"
              onClick={() =>
                void action(async () => {
                  await api('/auth/resend-verification', { method: 'POST' });
                  setMessage('Link enviado. Confira seu e-mail.');
                })
              }
            >
              Reenviar verificação
            </Button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const a = await api<AuthResponse>('/auth/me');
                  update(a.user);
                  setMessage(
                    a.user.emailVerified
                      ? 'E-mail confirmado.'
                      : 'O e-mail ainda não foi confirmado.',
                  );
                })
              }
            >
              Já confirmei meu e-mail
            </button>
          </div>
        )}
      </section>
      <section className="settings-card">
        <div className="setting-heading">
          <Fingerprint />
          <div>
            <h3>Alterar senha</h3>
            <p>Ao alterar, todos os dispositivos serão desconectados.</p>
          </div>
        </div>
        <form
          className="settings-form narrow-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = formData(e);
            void action(async () => {
              await api('/users/me/password', { method: 'POST', body: data });
              loggedOut();
            });
          }}
        >
          <Password name="currentPassword" label="Senha atual" />
          <Password
            name="newPassword"
            label="Nova senha"
            autoComplete="new-password"
            minLength={12}
          />
          <Button className="primary" disabled={busy}>
            Atualizar senha <ArrowRight size={16} />
          </Button>
        </form>
      </section>
      <section className="settings-card danger-zone">
        <div className="setting-heading">
          <Trash2 />
          <div>
            <h3>Excluir conta</h3>
            <p>Esta ação remove sua conta e encerra todas as sessões.</p>
          </div>
        </div>
        {!deleting ? (
          <Button className="danger" onClick={() => setDeleting(true)}>
            Excluir minha conta
          </Button>
        ) : (
          <form
            className="settings-form narrow-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = formData(e);
              void action(async () => {
                await api('/users/me', { method: 'DELETE', body: data });
                window.location.assign('/');
              });
            }}
          >
            <Notice error>A exclusão é permanente. Digite sua senha para confirmar.</Notice>
            <Password label="Confirme sua senha" />
            <div className="setting-actions">
              <Button className="danger" disabled={busy}>
                Excluir permanentemente
              </Button>
              <button type="button" className="text-button" onClick={() => setDeleting(false)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
function Sessions({ loggedOut }: { loggedOut: () => void }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true);
  const load = async () => {
    const data = await api<{ sessions: SessionInfo[] }>('/users/me/sessions');
    setSessions(data.sessions);
  };
  useEffect(() => {
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);
  async function revoke(id?: string) {
    setBusy(true);
    setError('');
    try {
      await api(id ? `/users/me/sessions/${id}` : '/users/me/revoke-others', {
        method: id ? 'DELETE' : 'POST',
      });
      if (sessions.find((s) => s.id === id)?.current) loggedOut();
      else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const device = (ua: string) =>
    `${ua.includes('Edg/') ? 'Edge' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Chrome') ? 'Chrome' : ua.includes('Safari') ? 'Safari' : 'Cliente'} · ${ua.includes('Windows') ? 'Windows' : ua.includes('Android') ? 'Android' : ua.includes('iPhone') ? 'iPhone' : ua.includes('Mac') ? 'macOS' : ua.includes('Linux') ? 'Linux' : 'Outro sistema'}`;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">SEUS ACESSOS</p>
          <h1>Dispositivos</h1>
          <p>Confira onde sua conta está conectada.</p>
        </div>
      </div>
      {error && (
        <Notice error>
          {error}
          <button
            className="text-button"
            onClick={() => {
              setBusy(true);
              void load()
                .then(() => setError(''))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Tentar novamente
          </button>
        </Notice>
      )}
      <section className="settings-card">
        <div className="setting-heading">
          <Monitor />
          <div>
            <h3>Sessões ativas</h3>
            <p>Encerre os acessos que você não reconhece.</p>
          </div>
          <span className="badge">
            {sessions.length} {sessions.length === 1 ? 'sessão' : 'sessões'}
          </span>
        </div>
        {busy && !sessions.length ? (
          <LoaderCircle className="spin" />
        ) : (
          sessions.map((s) => (
            <div className="session-row" key={s.id}>
              <span className="session-icon">
                <Monitor size={22} />
              </span>
              <div>
                <h4>
                  {device(s.device)}{' '}
                  {s.current && <span className="current-badge">Este dispositivo</span>}
                </h4>
                <p>Última atividade: {date(s.lastSeenAt)}</p>
                <small>
                  {s.persistent ? 'Manter conectado ativado' : 'Sessão temporária'} · Expira em{' '}
                  {date(s.expiresAt)}
                </small>
              </div>
              <button
                className="icon-button"
                disabled={busy}
                aria-label={`Encerrar ${s.current ? 'esta sessão' : device(s.device)}`}
                onClick={() => void revoke(s.id)}
              >
                <LogOut size={18} />
              </button>
            </div>
          ))
        )}
        <div className="setting-actions">
          <Button
            className="secondary"
            disabled={busy || sessions.filter((s) => !s.current).length === 0}
            onClick={() => void revoke()}
          >
            Encerrar outras sessões
          </Button>
        </div>
      </section>
      <div className="privacy-note">
        <LockKeyhole size={19} />
        <p>
          Ao sair de um dispositivo, a sessão é revogada no servidor. Para entrar novamente, será
          necessário informar sua senha.
        </p>
      </div>
    </>
  );
}
