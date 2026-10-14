import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type Participant } from 'livekit-client';
import { Mic, MicOff, PhoneOff, Video, MonitorUp, Volume2 } from 'lucide-react';
import type { ChannelInfo } from '@warp/shared';
import { api } from './api';

export function Voice({
  channel,
  canManage,
  onLeave,
}: {
  channel: ChannelInfo;
  canManage: boolean;
  onLeave(): void;
}) {
  const roomRef = useRef<Room | null>(null),
    media = useRef<HTMLDivElement>(null);
  const [participants, setParticipants] = useState<Participant[]>([]),
    [speakers, setSpeakers] = useState<string[]>([]);
  const [status, setStatus] = useState('Conectando à sala…'),
    [error, setError] = useState('');
  const [mic, setMic] = useState(false),
    [camera, setCamera] = useState(false),
    [screen, setScreen] = useState(false);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]),
    [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let disposed = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      publishDefaults: { audioPreset: { maxBitrate: 32000 }, dtx: true, red: true },
    });
    roomRef.current = room;
    const refresh = () => {
      if (!disposed) {
        setParticipants([room.localParticipant, ...room.remoteParticipants.values()]);
        setMic(room.localParticipant.isMicrophoneEnabled);
        setCamera(room.localParticipant.isCameraEnabled);
        setScreen(room.localParticipant.isScreenShareEnabled);
      }
    };
    const attach = (track: { kind: string; attach(): HTMLMediaElement }, local = false) => {
      if (local && track.kind === 'audio') return;
      const el = track.attach();
      if (local) el.muted = true;
      el.setAttribute('playsinline', '');
      media.current?.appendChild(el);
    };
    room.on(RoomEvent.TrackSubscribed, (track) => attach(track));
    room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.track) attach(pub.track, true);
      refresh();
    });
    room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      pub.track?.detach().forEach((el) => el.remove());
      refresh();
    });
    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh);
    room.on(RoomEvent.ActiveSpeakersChanged, (people) =>
      setSpeakers(people.map((p) => p.identity)),
    );
    room.on(RoomEvent.Reconnecting, () => setStatus('Reconectando à voz…'));
    room.on(RoomEvent.Reconnected, () => {
      setStatus('Voz conectada');
      refresh();
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!disposed) {
        setConnected(false);
        setStatus('Chamada encerrada. Saia e entre novamente para reconectar.');
        setParticipants([]);
      }
    });
    room.on(RoomEvent.MediaDevicesError, (e) => setError(`Microfone/câmera: ${e.message}`));
    void (async () => {
      const connection = await api<{ url: string; token: string }>(
        `/channels/${channel.id}/voice`,
        { method: 'POST' },
      );
      if (disposed) return;
      await room.connect(connection.url, connection.token);
      if (disposed) {
        await room.disconnect();
        return;
      }
      setConnected(true);
      setStatus('Voz conectada');
      refresh();
      try {
        await room.startAudio();
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        setError('Permita o microfone no navegador. Você pode ouvir e tentar ativá-lo pelo botão.');
      }
      if (disposed) return;
      refresh();
      setInputs(await Room.getLocalDevices('audioinput'));
      setOutputs(await Room.getLocalDevices('audiooutput'));
    })().catch((e) => {
      if (!disposed) {
        setError((e as Error).message);
        setStatus('Não foi possível entrar na voz');
      }
    });
    return () => {
      disposed = true;
      roomRef.current = null;
      void room.disconnect();
      media.current?.replaceChildren();
    };
  }, [channel.id]);
  async function control(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      const p = roomRef.current?.localParticipant;
      if (p) {
        setMic(p.isMicrophoneEnabled);
        setCamera(p.isCameraEnabled);
        setScreen(p.isScreenShareEnabled);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function leave() {
    await roomRef.current?.disconnect();
    void api('/voice/current', { method: 'DELETE' }).catch(() => {});
    onLeave();
  }
  return (
    <section className="voice-panel" aria-label="Chamada de voz">
      <header>
        <div>
          <strong>{channel.name}</strong>
          <small>{status}</small>
        </div>
        <button aria-label="Sair da voz" onClick={() => void leave()}>
          <PhoneOff size={20} />
        </button>
      </header>
      {error && (
        <p role="alert" className="community-error">
          {error}
        </p>
      )}
      <div className="voice-actions">
        <button
          disabled={!connected}
          aria-label={mic ? 'Desativar microfone' : 'Ativar microfone'}
          onClick={() =>
            void control(() => roomRef.current!.localParticipant.setMicrophoneEnabled(!mic))
          }
        >
          {mic ? <Mic /> : <MicOff />}
        </button>
        <button
          disabled={!connected}
          aria-label={camera ? 'Desativar câmera' : 'Ativar câmera'}
          className={camera ? 'active' : ''}
          onClick={() =>
            void control(() => roomRef.current!.localParticipant.setCameraEnabled(!camera))
          }
        >
          <Video />
        </button>
        <button
          disabled={!connected}
          aria-label={screen ? 'Parar compartilhamento' : 'Compartilhar tela'}
          className={screen ? 'active' : ''}
          onClick={() =>
            void control(() => roomRef.current!.localParticipant.setScreenShareEnabled(!screen))
          }
        >
          <MonitorUp />
        </button>
        <button
          disabled={!connected}
          aria-label="Ativar reprodução de áudio"
          onClick={() => void control(() => roomRef.current!.startAudio())}
        >
          <Volume2 />
        </button>
      </div>
      <label>
        Microfone
        <select
          disabled={!connected}
          onChange={(e) =>
            void control(() => roomRef.current!.switchActiveDevice('audioinput', e.target.value))
          }
        >
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Microfone'}
            </option>
          ))}
        </select>
      </label>
      {'setSinkId' in HTMLMediaElement.prototype && (
        <label>
          Saída de áudio
          <select
            disabled={!connected}
            onChange={(e) =>
              void control(() => roomRef.current!.switchActiveDevice('audiooutput', e.target.value))
            }
          >
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Saída de áudio'}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="voice-people">
        {participants.map((p) => (
          <div key={p.identity} className={speakers.includes(p.identity) ? 'speaking' : ''}>
            <span>
              {p.isMicrophoneEnabled ? <Mic size={14} /> : <MicOff size={14} />}{' '}
              {p.name || 'Participante'} {p.isLocal && '(você)'}
            </span>
            {!p.isLocal && (
              <input
                aria-label={`Volume de ${p.name}`}
                type="range"
                min="0"
                max="1"
                step="0.05"
                defaultValue="1"
                onChange={(e) =>
                  roomRef.current?.remoteParticipants
                    .get(p.identity)
                    ?.setVolume(Number(e.target.value))
                }
              />
            )}
            {canManage && !p.isLocal && (
              <div>
                <button
                  onClick={() =>
                    void control(() =>
                      api(`/channels/${channel.id}/voice/moderate`, {
                        method: 'POST',
                        body: { identity: p.identity, action: 'mute' },
                      }),
                    )
                  }
                >
                  Silenciar
                </button>
                <button
                  onClick={() =>
                    void control(() =>
                      api(`/channels/${channel.id}/voice/moderate`, {
                        method: 'POST',
                        body: { identity: p.identity, action: 'disconnect' },
                      }),
                    )
                  }
                >
                  Desconectar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="voice-media" ref={media} />
    </section>
  );
}
