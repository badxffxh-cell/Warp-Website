import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, MessageSquare, Phone, Check, X, ShieldBan, Users } from 'lucide-react';
import type { FriendInfo, PublicUser } from '@warp/shared';
import { api } from './api';

export function Friends({
  friends,
  reload,
  open,
  call,
}: {
  friends: FriendInfo[];
  reload(): Promise<void>;
  open(f: FriendInfo): void;
  call(f: FriendInfo): void;
}) {
  const [username, setUsername] = useState(''),
    [tab, setTab] = useState<'all' | 'pending' | 'blocked'>('all');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [blocks, setBlocks] = useState<PublicUser[]>([]);
  const loadBlocks = () => api<{ users: PublicUser[] }>('/blocks').then((r) => setBlocks(r.users));
  useEffect(() => {
    if (tab === 'blocked') void loadBlocks().catch((e) => setError(e.message));
  }, [tab]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('/friends', { method: 'POST', body: { username } });
      setUsername('');
      setNotice('Solicitação enviada. Sua pessoa recebe o convite na aba Pendentes.');
    });
  }
  return (
    <section className="friends-home">
      <div className="friends-heading">
        <Users size={42} />
        <span className="eyebrow">PERTO DE QUEM IMPORTA</span>
        <h1>Suas pessoas, aqui.</h1>
        <p>Encontre amigos pelo @username e comece uma conversa.</p>
      </div>
      <form className="add-friend" onSubmit={add}>
        <label htmlFor="friend-username">Adicionar amigo</label>
        <div>
          <input
            id="friend-username"
            placeholder="@username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={33}
            autoComplete="off"
          />
          <button className="primary" disabled={busy || !username.trim()}>
            <UserPlus size={18} /> Enviar solicitação
          </button>
        </div>
      </form>
      {error && (
        <p className="community-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="friend-notice" role="status">
          {notice}
        </p>
      )}
      <nav className="friend-tabs" aria-label="Lista de amigos">
        <button className={tab === 'all' ? 'selected' : ''} onClick={() => setTab('all')}>
          Amigos · {friends.filter((f) => f.status === 'ACCEPTED').length}
        </button>
        <button className={tab === 'pending' ? 'selected' : ''} onClick={() => setTab('pending')}>
          Pendentes · {friends.filter((f) => f.status === 'PENDING').length}
        </button>
        <button className={tab === 'blocked' ? 'selected' : ''} onClick={() => setTab('blocked')}>
          Bloqueados
        </button>
      </nav>
      {tab !== 'blocked' &&
        friends
          .filter((f) => (tab === 'all' ? f.status === 'ACCEPTED' : f.status === 'PENDING'))
          .map((f) => (
            <article className="friend-row" key={f.id}>
              <span className="user-initials">{f.user.displayName.slice(0, 2)}</span>
              <div className="friend-name">
                <strong>{f.user.displayName}</strong>
                <small>
                  @{f.user.username}{' '}
                  {f.status === 'PENDING' && (f.incoming ? '· Recebida' : '· Enviada')}
                </small>
              </div>
              <div className="friend-actions">
                {f.status === 'ACCEPTED' ? (
                  <>
                    <button
                      title="Conversar"
                      aria-label={`Conversar com ${f.user.username}`}
                      onClick={() => open(f)}
                    >
                      <MessageSquare size={19} />
                    </button>
                    <button
                      title="Chamar"
                      aria-label={`Chamar ${f.user.username}`}
                      onClick={() => call(f)}
                    >
                      <Phone size={19} />
                    </button>
                  </>
                ) : (
                  f.incoming && (
                    <button
                      title="Aceitar"
                      aria-label={`Aceitar ${f.user.username}`}
                      disabled={busy}
                      onClick={() =>
                        void run(() => api(`/friends/${f.id}/accept`, { method: 'POST' }))
                      }
                    >
                      <Check size={19} />
                    </button>
                  )
                )}
                <button
                  title={f.status === 'ACCEPTED' ? 'Remover amizade' : 'Recusar ou cancelar'}
                  aria-label={`Remover ${f.user.username}`}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (
                        f.status === 'ACCEPTED' &&
                        !confirm('Remover amizade e excluir esta conversa privada?')
                      )
                        return;
                      await api(`/friends/${f.id}`, { method: 'DELETE' });
                    })
                  }
                >
                  <X size={19} />
                </button>
                <button
                  title="Bloquear"
                  aria-label={`Bloquear ${f.user.username}`}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (confirm('Bloquear esta pessoa e excluir a conversa privada?'))
                        await api('/blocks', { method: 'POST', body: { userId: f.user.id } });
                    })
                  }
                >
                  <ShieldBan size={18} />
                </button>
              </div>
            </article>
          ))}
      {tab === 'blocked' &&
        blocks.map((u) => (
          <article className="friend-row" key={u.id}>
            <div className="friend-name">
              <strong>{u.displayName}</strong>
              <small>@{u.username}</small>
            </div>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/blocks/${u.id}`, { method: 'DELETE' });
                  await loadBlocks();
                })
              }
            >
              Desbloquear
            </button>
          </article>
        ))}
      {(tab === 'blocked'
        ? blocks.length === 0
        : friends.filter((f) => (tab === 'all' ? f.status === 'ACCEPTED' : f.status === 'PENDING'))
            .length === 0) && (
        <p className="friends-empty">
          {tab === 'all'
            ? 'Sua próxima conversa começa com um @username.'
            : tab === 'pending'
              ? 'Nenhuma solicitação pendente.'
              : 'Nenhuma pessoa bloqueada.'}
        </p>
      )}
    </section>
  );
}
