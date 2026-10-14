import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Hash,
  Volume2,
  Plus,
  Settings2,
  LogOut,
  Send,
  Users,
  Copy,
  Menu,
  X,
  Pencil,
  Trash2,
  Link,
  ArrowLeft,
  Phone,
  UserPlus,
} from 'lucide-react';
import { WarpMark } from '@warp/ui';
import type {
  FriendInfo,
  UserProfile,
  ServerInfo,
  ChannelInfo,
  ChatMessage,
  MemberInfo,
  RealtimeEvent,
} from '@warp/shared';
import { api, API_URL } from './api';
import './community.css';
import { Friends } from './Friends';
const Voice = lazy(() => import('./Voice').then((m) => ({ default: m.Voice })));
type Modal = 'create' | 'join' | 'invite' | 'channel' | 'server' | 'rename' | 'edit' | null;
function merge(old: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(old.map((m) => [m.id, m]));
  for (const m of incoming) {
    const prev = map.get(m.id);
    if (
      !prev ||
      (m.deletedAt || m.editedAt || m.createdAt) >=
        (prev.deletedAt || prev.editedAt || prev.createdAt)
    )
      map.set(m.id, m);
  }
  return [...map.values()].sort((a, b) => (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1));
}
export function Community({
  user,
  onAccount,
  onLogout,
}: {
  user: UserProfile;
  onAccount(): void;
  onLogout(): void;
}) {
  const [home, setHome] = useState(true),
    [friends, setFriends] = useState<FriendInfo[]>([]),
    [dm, setDm] = useState<FriendInfo | null>(null);
  const [incoming, setIncoming] = useState<Extract<RealtimeEvent, { type: 'call' }> | null>(null);
  const lastTyping = useRef(0);
  const [servers, setServers] = useState<ServerInfo[]>([]),
    [serverId, setServerId] = useState(''),
    [channelId, setChannelId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [members, setMembers] = useState<MemberInfo[]>([]);
  const [draft, setDraft] = useState(''),
    [error, setError] = useState(''),
    [sending, setSending] = useState(false),
    [hasMore, setHasMore] = useState(false);
  const [modal, setModal] = useState<Modal>(null),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState(''),
    [editing, setEditing] = useState<ChatMessage | null>(null);
  const [sidebar, setSidebar] = useState(false),
    [showMembers, setShowMembers] = useState(false),
    [status, setStatus] = useState('Conectando…'),
    [typing, setTyping] = useState('');
  const [voiceChannel, setVoiceChannel] = useState<ChannelInfo | null>(null),
    [loading, setLoading] = useState(true);
  const socket = useRef<WebSocket | null>(null),
    selected = useRef(channelId),
    pending = useRef<{ content: string; id: string; channel: string } | null>(null);
  const typingTimer = useRef<number | undefined>(undefined),
    bottom = useRef<HTMLDivElement>(null),
    scrollBox = useRef<HTMLDivElement>(null),
    stick = useRef(true);
  const server = home ? undefined : servers.find((s) => s.id === serverId),
    channel = home ? dm?.channel : server?.channels.find((c) => c.id === channelId),
    manage = !!server && server.role !== 'MEMBER';
  selected.current = channelId;
  async function reloadFriends() {
    const r = await api<{ friends: FriendInfo[] }>('/friends');
    setFriends(r.friends);
    setDm((old) =>
      old ? (r.friends.find((f) => f.id === old.id && f.status === 'ACCEPTED') ?? null) : null,
    );
  }
  function openFriend(f: FriendInfo) {
    setHome(true);
    setDm(f);
    setChannelId(f.channel?.id ?? '');
    setSidebar(false);
    setShowMembers(false);
  }
  async function callFriend(f: FriendInfo) {
    if (!f.channel) return;
    await run(async () => {
      await api(`/channels/${f.channel!.id}/call`, { method: 'POST' });
      openFriend(f);
      setVoiceChannel(f.channel);
    });
  }
  useEffect(() => {
    void reloadFriends().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (home) setChannelId(dm?.channel?.id ?? '');
  }, [home, dm]);
  useEffect(() => {
    if (!incoming) return;
    const timer = setTimeout(() => setIncoming(null), 30000);
    return () => clearTimeout(timer);
  }, [incoming]);
  async function reload() {
    const result = await api<{ servers: ServerInfo[] }>('/servers');
    setServers(result.servers);
    setServerId((id) =>
      result.servers.some((s) => s.id === id) ? id : (result.servers[0]?.id ?? ''),
    );
  }
  useEffect(() => {
    void reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const code = new URLSearchParams(location.search).get('invite');
    if (code) {
      setInvite(code);
      setModal('join');
    }
  }, []);
  useEffect(() => {
    if (home) return;
    const first = server?.channels.find((c) => c.kind === 'TEXT');
    setChannelId((id) =>
      server?.channels.some((c) => c.id === id && c.kind === 'TEXT') ? id : (first?.id ?? ''),
    );
    if (serverId)
      void api<{ members: MemberInfo[] }>(`/servers/${serverId}/members`)
        .then((r) => setMembers(r.members))
        .catch((e) => setError(e.message));
    else setMembers([]);
  }, [serverId, servers, home]);
  useEffect(() => {
    if (
      voiceChannel &&
      !servers.some((s) => s.channels.some((c) => c.id === voiceChannel.id)) &&
      !friends.some((f) => f.channel?.id === voiceChannel.id)
    )
      setVoiceChannel(null);
  }, [servers, friends]);
  async function history(id: string, older = false) {
    if (!id) return;
    const before = older && messages[0] ? `?before=${messages[0].sequence}` : '';
    const r = await api<{ messages: ChatMessage[]; hasMore: boolean }>(
      `/channels/${id}/messages${before}`,
    );
    if (selected.current !== id) return;
    setMessages((old) => (older ? merge(r.messages, old) : merge(old, r.messages)));
    setHasMore(r.hasMore);
  }
  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setTyping('');
    setDraft('');
    pending.current = null;
    stick.current = true;
    if (channelId && socket.current?.readyState === WebSocket.OPEN && status === 'Ao vivo')
      socket.current.send(JSON.stringify({ type: 'subscribe', channelId }));
    else if (channelId) void history(channelId).catch((e) => setError(e.message));
  }, [channelId]);
  useEffect(() => {
    let disposed = false,
      retry = 0,
      timer: number | undefined;
    async function connect() {
      setStatus(retry ? 'Reconectando…' : 'Conectando…');
      try {
        const ticket = await api<{ ticket: string; url: string }>('/realtime/ticket', {
          method: 'POST',
        });
        if (disposed) return;
        const ws = new WebSocket(ticket.url);
        socket.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket: ticket.ticket }));
        ws.onmessage = (event) => {
          let data: RealtimeEvent;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (data.type === 'ready') {
            retry = 0;
            setStatus('Ao vivo');
            void reload().catch((e) => setError(e.message));
            if (selected.current)
              ws.send(JSON.stringify({ type: 'subscribe', channelId: selected.current }));
          }
          if (data.type === 'subscribed' && data.channelId === selected.current)
            void history(data.channelId).catch((e) => setError(e.message));
          if (data.type === 'friends.changed')
            void reloadFriends().catch((e) => setError(e.message));
          if (data.type === 'call') setIncoming(data);
          if (data.type === 'servers.changed') void reload().catch((e) => setError(e.message));
          if (data.type === 'message' && data.message.channelId === selected.current)
            setMessages((old) => merge(old, [data.message]));
          if (
            data.type === 'typing' &&
            data.channelId === selected.current &&
            data.user.id !== user.id
          ) {
            setTyping(`${data.user.displayName} está digitando…`);
            clearTimeout(typingTimer.current);
            typingTimer.current = window.setTimeout(() => setTyping(''), 4000);
          }
          if (data.type === 'error') setError(data.message);
        };
        ws.onclose = () => {
          if (!disposed) schedule();
        };
        ws.onerror = () => ws.close();
      } catch (e) {
        if (!disposed) {
          setError((e as Error).message);
          schedule();
        }
      }
    }
    function schedule() {
      setStatus('Reconectando…');
      timer = window.setTimeout(
        () => void connect(),
        Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)) + Math.random() * 500,
      );
    }
    void connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(typingTimer.current);
      socket.current?.close();
      socket.current = null;
    };
  }, []);
  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);
  async function run(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending || !channelId) return;
    const content = draft.trim(),
      id = channelId;
    if (!pending.current || pending.current.content !== content || pending.current.channel !== id)
      pending.current = { content, id: crypto.randomUUID(), channel: id };
    const clientId = pending.current.id;
    setSending(true);
    await run(async () => {
      const r = await api<{ message: ChatMessage }>(`/channels/${id}/messages`, {
        method: 'POST',
        body: { content, clientId },
      });
      if (selected.current === id) {
        setMessages((old) => merge(old, [r.message]));
        setDraft('');
        pending.current = null;
        stick.current = true;
      }
    });
    setSending(false);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (modal === 'create') {
        const r = await api<{ server: ServerInfo }>('/servers', {
          method: 'POST',
          body: { name: data.name, description: data.description },
        });
        await reload();
        setServerId(r.server.id);
        setHome(false);
        setDm(null);
      }
      if (modal === 'join') {
        let code = String(data.code).trim();
        try {
          code = new URL(code).searchParams.get('invite') ?? code;
        } catch {}
        const r = await api<{ serverId: string }>('/invites/join', {
          method: 'POST',
          body: { code },
        });
        await reload();
        setServerId(r.serverId);
        setHome(false);
        setDm(null);
        window.history.replaceState(null, '', '/');
      }
      if (modal === 'channel') {
        await api(`/servers/${serverId}/channels`, {
          method: 'POST',
          body: { name: data.name, kind: data.kind },
        });
        await reload();
      }
      if (modal === 'server') {
        await api(`/servers/${serverId}`, {
          method: 'PATCH',
          body: { name: data.name, description: data.description },
        });
        await reload();
      }
      if (modal === 'rename') {
        await api(`/channels/${channelId}`, { method: 'PATCH', body: { name: data.name } });
        await reload();
      }
      if (modal === 'edit' && editing) {
        const r = await api<{ message: ChatMessage }>(`/messages/${editing.id}`, {
          method: 'PATCH',
          body: { content: data.content },
        });
        setMessages((old) => merge(old, [r.message]));
      }
      if (modal === 'invite') {
        const r = await api<{ url: string }>(`/servers/${serverId}/invites`, {
          method: 'POST',
          body: { hours: Number(data.hours), maxUses: Number(data.maxUses) },
        });
        setInvite(r.url);
        setBusy(false);
        return;
      }
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(m: Modal) {
    setError('');
    if (m === 'invite') setInvite('');
    setModal(m);
  }
  return (
    <div className="community-shell">
      <aside className="community-rail">
        <button className="brand" title="Sua conta" onClick={onAccount}>
          <WarpMark width={32} />
        </button>
        <button
          aria-label="Amigos e conversas"
          title="Amigos e conversas"
          className={home ? 'selected' : ''}
          onClick={() => {
            setHome(true);
            setDm(null);
            setShowMembers(false);
          }}
        >
          <Users />
        </button>
        <div className="community-server-list">
          {servers.map((s) => (
            <button
              key={s.id}
              title={s.name}
              aria-label={`Abrir ${s.name}`}
              className={s.id === serverId ? 'selected' : ''}
              onClick={() => {
                setHome(false);
                setDm(null);
                setServerId(s.id);
                setSidebar(true);
              }}
            >
              {s.name.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </div>
        <button aria-label="Criar servidor" onClick={() => open('create')}>
          <Plus />
        </button>
        <button aria-label="Entrar por convite" onClick={() => open('join')}>
          <Link />
        </button>
        <div className="rail-spacer" />
        <button aria-label="Minha conta" onClick={onAccount}>
          <Settings2 />
        </button>
        <button aria-label="Sair da conta" onClick={onLogout}>
          <LogOut />
        </button>
      </aside>
      <aside className={`community-sidebar ${sidebar ? 'open' : ''}`}>
        <header>
          <strong>{home ? 'Amigos e conversas' : (server?.name ?? 'Seus servidores')}</strong>
          <button
            className="mobile-only"
            aria-label="Fechar canais"
            onClick={() => setSidebar(false)}
          >
            <X />
          </button>
        </header>
        <p className="server-description">
          {server?.description || 'Um espaço para suas conversas.'}
        </p>
        {manage && (
          <div className="channel-tools">
            <button onClick={() => open('invite')}>
              <Link size={15} /> Convidar
            </button>
            <button onClick={() => open('server')} aria-label="Configurar servidor">
              <Settings2 size={16} />
            </button>
          </div>
        )}
        {home && (
          <>
            <button className="channel-button" onClick={() => setDm(null)}>
              <UserPlus size={18} />
              Adicionar amigos
            </button>
            <div className="channel-section">
              <span>CONVERSAS PRIVADAS</span>
            </div>
            {friends
              .filter((f) => f.status === 'ACCEPTED')
              .map((f) => (
                <button
                  key={f.id}
                  className={`channel-button ${dm?.id === f.id ? 'selected' : ''}`}
                  onClick={() => openFriend(f)}
                >
                  {' '}
                  <span className="dm-dot" />
                  {f.user.displayName}
                </button>
              ))}
          </>
        )}
        <div className="channel-section">
          <span>{home ? 'SUA COMUNIDADE' : 'CANAIS DE TEXTO'}</span>
          {manage && (
            <button aria-label="Criar canal" onClick={() => open('channel')}>
              <Plus size={16} />
            </button>
          )}
        </div>
        {server?.channels
          .filter((c) => c.kind === 'TEXT')
          .map((c) => (
            <button
              key={c.id}
              className={`channel-button ${c.id === channelId ? 'selected' : ''}`}
              onClick={() => {
                setChannelId(c.id);
                setSidebar(false);
              }}
            >
              <Hash size={19} />
              {c.name}
            </button>
          ))}
        {home ? (
          <button className="channel-button" onClick={() => open('create')}>
            <Plus size={18} />
            Criar servidor
          </button>
        ) : (
          <div className="channel-section">
            <span>CANAIS DE VOZ</span>
          </div>
        )}
        {server?.channels
          .filter((c) => c.kind === 'VOICE')
          .map((c) => (
            <button
              key={c.id}
              className={`channel-button ${voiceChannel?.id === c.id ? 'selected' : ''}`}
              onClick={() => {
                setVoiceChannel(c);
                setSidebar(false);
              }}
            >
              <Volume2 size={19} />
              {c.name}
            </button>
          ))}
        {server && (
          <button
            className="leave-server"
            onClick={() =>
              void run(async () => {
                if (
                  !confirm(
                    server.role === 'OWNER'
                      ? 'Excluir este servidor e todo o histórico? Esta ação é permanente.'
                      : 'Sair deste servidor?',
                  )
                )
                  return;
                await api(
                  server.role === 'OWNER'
                    ? `/servers/${server.id}`
                    : `/servers/${server.id}/members/${user.id}`,
                  { method: 'DELETE' },
                );
                await reload();
              })
            }
          >
            {server.role === 'OWNER' ? 'Excluir servidor' : 'Sair do servidor'}
          </button>
        )}
        <div className="community-self">
          <span className="user-initials">{user.displayName.slice(0, 2)}</span>
          <div>
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
          </div>
        </div>
      </aside>
      <main className="chat-main">
        <header className="chat-header">
          <button
            className="mobile-only"
            aria-label="Mostrar canais"
            onClick={() => setSidebar(true)}
          >
            <Menu />
          </button>
          <Hash size={22} />
          <strong>{channel?.name ?? (home ? 'Amigos' : 'Bem-vindo ao Warp')}</strong>
          <span className={`connection-state ${status === 'Ao vivo' ? 'live' : ''}`}>{status}</span>
          {manage && channel && (
            <>
              <button aria-label="Renomear canal" onClick={() => open('rename')}>
                <Pencil size={17} />
              </button>
              <button
                aria-label="Excluir canal"
                onClick={() =>
                  void run(async () => {
                    if (confirm('Excluir este canal e suas mensagens?')) {
                      await api(`/channels/${channelId}`, { method: 'DELETE' });
                      await reload();
                    }
                  })
                }
              >
                <Trash2 size={17} />
              </button>
            </>
          )}
          {home && dm && (
            <button aria-label="Iniciar chamada" onClick={() => void callFriend(dm)}>
              <Phone size={20} />
            </button>
          )}
          <button aria-label="Mostrar membros" onClick={() => setShowMembers(!showMembers)}>
            <Users size={20} />
          </button>
        </header>
        {error && (
          <div className="community-error" role="alert">
            {error}
            <button aria-label="Dispensar aviso" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {incoming && (
          <div className="incoming-call" role="status">
            <Phone size={20} />
            <span>{incoming.user.displayName} está chamando</span>
            <button
              className="primary"
              onClick={() => {
                const f = friends.find((f) => f.channel?.id === incoming.channelId);
                if (f?.channel) {
                  openFriend(f);
                  setVoiceChannel(f.channel);
                }
                setIncoming(null);
              }}
            >
              Atender
            </button>
            <button onClick={() => setIncoming(null)}>Recusar</button>
          </div>
        )}
        {home && !dm ? (
          <Friends
            friends={friends}
            reload={reloadFriends}
            open={openFriend}
            call={(f) => void callFriend(f)}
          />
        ) : !server && !dm ? (
          <div className="community-welcome">
            <WarpMark width={72} />
            <span className="eyebrow">SEU PONTO DE ENCONTRO</span>
            <h1>As conversas começam aqui.</h1>
            <p>
              {loading
                ? 'Carregando seus servidores…'
                : 'Crie um espaço para sua comunidade ou entre com um convite.'}
            </p>
            <div>
              <button className="primary" onClick={() => open('create')}>
                <Plus size={18} /> Criar servidor
              </button>
              <button onClick={() => open('join')}>Tenho um convite</button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="message-history"
              ref={scrollBox}
              onScroll={() => {
                const el = scrollBox.current!;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              }}
            >
              {hasMore && (
                <button
                  className="load-history"
                  onClick={() => void run(() => history(channelId, true))}
                >
                  Carregar mensagens anteriores
                </button>
              )}
              {!messages.length && (
                <div className="channel-intro">
                  <Hash size={40} />
                  <h2>
                    {channel
                      ? home
                        ? `Sua conversa com ${channel.name}`
                        : `Este é o começo de #${channel.name}`
                      : 'Crie um canal de texto'}
                  </h2>
                  <p>
                    {home
                      ? 'Uma conversa privada entre vocês.'
                      : 'Mensagens ficam salvas para a sua comunidade.'}
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <article className="chat-message" key={m.id}>
                  <span className="message-avatar">
                    {m.author?.avatarUrl ? (
                      <img src={`${API_URL}${m.author.avatarUrl}`} alt="" />
                    ) : (
                      (m.author?.displayName ?? '?').slice(0, 2)
                    )}
                  </span>
                  <div className="message-body">
                    <header>
                      <strong>{m.author?.displayName ?? 'Conta excluída'}</strong>
                      <time dateTime={m.createdAt}>
                        {new Date(m.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {m.editedAt && <small>editada</small>}
                    </header>
                    <p className={m.deletedAt ? 'deleted-message' : ''}>
                      {m.deletedAt ? 'Mensagem excluída' : m.content}
                    </p>
                  </div>
                  {!m.deletedAt && (
                    <div className="message-actions">
                      {m.author?.id === user.id && (
                        <button
                          aria-label="Editar mensagem"
                          onClick={() => {
                            setEditing(m);
                            open('edit');
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {(manage || m.author?.id === user.id) && (
                        <button
                          aria-label="Excluir mensagem"
                          onClick={() =>
                            void run(async () => {
                              if (!confirm('Excluir esta mensagem?')) return;
                              const r = await api<{ message: ChatMessage }>(`/messages/${m.id}`, {
                                method: 'DELETE',
                              });
                              setMessages((old) => merge(old, [r.message]));
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
              <div ref={bottom} />
            </div>
            <div className="typing-indicator" aria-live="polite">
              {typing}
            </div>
            <form className="chat-composer" onSubmit={sendMessage}>
              <textarea
                aria-label="Mensagem"
                placeholder={channel ? `Conversar em #${channel.name}` : 'Selecione um canal'}
                disabled={!channel}
                maxLength={4000}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (socket.current?.readyState === 1 && Date.now() - lastTyping.current > 2600) {
                    lastTyping.current = Date.now();
                    socket.current.send(JSON.stringify({ type: 'typing' }));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void sendMessage(e);
                  }
                }}
              />
              <button
                className="primary"
                aria-label="Enviar mensagem"
                disabled={sending || !draft.trim() || !channel}
              >
                <Send size={20} />
              </button>
            </form>
            <small className="composer-hint">
              Enter para enviar · Shift + Enter para nova linha{sending && ' · Enviando…'}
            </small>
          </>
        )}
      </main>
      {(showMembers || voiceChannel) && (
        <aside className="community-details">
          {voiceChannel && (
            <Suspense fallback={<p>Carregando áudio…</p>}>
              <Voice
                key={voiceChannel.id}
                channel={voiceChannel}
                canManage={
                  !!voiceChannel.serverId &&
                  !!servers.find((s) => s.id === voiceChannel.serverId && s.role !== 'MEMBER')
                }
                onLeave={() => setVoiceChannel(null)}
              />
            </Suspense>
          )}
          {showMembers && (
            <section className="members-panel">
              <h3>Membros · {members.length}</h3>
              {members.map((m) => (
                <div key={m.user.id}>
                  <strong>{m.user.displayName}</strong>
                  <small>
                    {m.role === 'OWNER'
                      ? 'Proprietário'
                      : m.role === 'ADMIN'
                        ? 'Administrador'
                        : 'Membro'}
                  </small>
                  {server?.role === 'OWNER' && m.user.id !== user.id && (
                    <div className="member-actions">
                      <button
                        onClick={() =>
                          void run(async () => {
                            await api(`/servers/${serverId}/members/${m.user.id}`, {
                              method: 'PATCH',
                              body: { role: m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' },
                            });
                            await reload();
                          })
                        }
                      >
                        {m.role === 'ADMIN' ? 'Tornar membro' : 'Tornar admin'}
                      </button>
                      <button
                        onClick={() =>
                          void run(async () => {
                            if (confirm(`Transferir a propriedade para ${m.user.displayName}?`)) {
                              await api(`/servers/${serverId}/transfer`, {
                                method: 'POST',
                                body: { userId: m.user.id },
                              });
                              await reload();
                            }
                          })
                        }
                      >
                        Transferir
                      </button>
                    </div>
                  )}
                  {manage && m.role !== 'OWNER' && m.user.id !== user.id && (
                    <button
                      onClick={() =>
                        void run(async () => {
                          if (confirm(`Expulsar ${m.user.displayName}?`)) {
                            await api(`/servers/${serverId}/members/${m.user.id}`, {
                              method: 'DELETE',
                            });
                            await reload();
                          }
                        })
                      }
                    >
                      Expulsar
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
        </aside>
      )}
      {modal && (
        <div
          className="community-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="community-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <header>
              <h2 id="dialog-title">
                {
                  {
                    create: 'Criar servidor',
                    join: 'Entrar por convite',
                    invite: 'Convidar pessoas',
                    channel: 'Criar canal',
                    server: 'Configurar servidor',
                    rename: 'Renomear canal',
                    edit: 'Editar mensagem',
                  }[modal]
                }
              </h2>
              <button aria-label="Fechar" onClick={() => setModal(null)} disabled={busy}>
                <X />
              </button>
            </header>
            <form onSubmit={submit}>
              {['create', 'server', 'channel', 'rename'].includes(modal) && (
                <label>
                  Nome
                  <input
                    autoFocus
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={
                      modal === 'server' ? server?.name : modal === 'rename' ? channel?.name : ''
                    }
                  />
                </label>
              )}
              {(modal === 'create' || modal === 'server') && (
                <label>
                  Descrição
                  <textarea
                    name="description"
                    maxLength={500}
                    defaultValue={modal === 'server' ? server?.description : ''}
                  />
                </label>
              )}
              {modal === 'channel' && (
                <label>
                  Tipo
                  <select name="kind">
                    <option value="TEXT">Texto</option>
                    <option value="VOICE">Voz</option>
                  </select>
                </label>
              )}
              {modal === 'join' && (
                <label>
                  Link ou código do convite
                  <input autoFocus name="code" required defaultValue={invite} />
                </label>
              )}
              {modal === 'edit' && (
                <label>
                  Mensagem
                  <textarea
                    autoFocus
                    name="content"
                    required
                    maxLength={4000}
                    defaultValue={editing?.content}
                  />
                </label>
              )}
              {modal === 'invite' && (
                <>
                  <label>
                    Validade
                    <select name="hours">
                      <option value="24">24 horas</option>
                      <option value="1">1 hora</option>
                      <option value="168">7 dias</option>
                    </select>
                  </label>
                  <label>
                    Limite de usos
                    <input name="maxUses" type="number" min="1" max="100" defaultValue="10" />
                  </label>
                  {invite && (
                    <label>
                      Convite criado
                      <input value={invite} readOnly onFocus={(e) => e.target.select()} />
                      <button
                        type="button"
                        onClick={() => void run(() => navigator.clipboard.writeText(invite))}
                      >
                        <Copy size={16} /> Copiar convite
                      </button>
                    </label>
                  )}
                </>
              )}
              {error && (
                <p className="community-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? 'Salvando…'
                  : modal === 'invite'
                    ? 'Gerar convite'
                    : modal === 'join'
                      ? 'Entrar'
                      : 'Salvar'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
