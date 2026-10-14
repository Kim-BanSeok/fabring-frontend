import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui.jsx';
import { composeVoiceAnswer, createBrowserVoice, primeMicrophone, voiceErrorMessage } from './sellerVoice.js';

const SILENCE_MS = 1000;
const AFTER_SPEECH_MS = 700;

const sameWords = (left, right) => left.replace(/\s+/g, '') === right.replace(/\s+/g, '');

// 질문이 끝나면 마이크를 계속 열어 두고, 말이 잠깐 끊기면 그때 답을 보낸다.
export default function SellerVoiceAnswer({ questionText, paused, onSpoken, onHearing }) {
  return <VoiceAnswerTurn key={`${questionText}:${paused}`} questionText={questionText} paused={paused} onSpoken={onSpoken} onHearing={onHearing} />;
}

function VoiceAnswerTurn({ questionText, paused, onSpoken, onHearing }) {
  const [voice] = useState(createBrowserVoice);
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const turn = useRef(0);
  const timers = useRef([]);
  const spokenRef = useRef(onSpoken);
  const hearingRef = useRef(onHearing);
  useEffect(() => {
    spokenRef.current = onSpoken;
    hearingRef.current = onHearing;
  }, [onSpoken, onHearing]);

  const clearTimers = useCallback(() => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; }, []);
  const later = useCallback((fn, ms) => { const id = window.setTimeout(fn, ms); timers.current.push(id); return id; }, []);
  const cancel = useCallback(() => { turn.current += 1; clearTimers(); voice.stop(); }, [clearTimers, voice]);
  const stop = () => { cancel(); setPhase('idle'); };

  const run = useCallback((current) => {
    let heard = '';
    let committed = false;
    let restarts = 0;
    let networkErrors = 0;
    let silenceId = 0;

    const scheduleCommit = () => {
      window.clearTimeout(silenceId);
      silenceId = later(commit, SILENCE_MS);
    };

    const commit = () => {
      if (committed || current !== turn.current) return;
      const text = heard.trim();
      if (!text || sameWords(text, questionText)) return;
      committed = true;
      clearTimers();
      voice.stopListening();
      setPhase('idle');
      spokenRef.current?.(text);
    };

    const listen = () => {
      if (committed || current !== turn.current) return;
      if (!voice.canListen) {
        setPhase('idle');
        setMessage('이 브라우저는 말을 글로 바꾸지 못해요. Chrome에서 마이크를 허용해 주세요.');
        return;
      }
      const base = heard;
      setPhase('listening');
      voice.listen({
        onresult: ({ finalText, interimText }) => {
          if (committed || current !== turn.current) return;
          heard = composeVoiceAnswer(base, finalText, interimText);
          hearingRef.current?.(heard);
          if (heard.trim() && !sameWords(heard.trim(), questionText)) scheduleCommit();
        },
        onerror: (code) => {
          if (committed || current !== turn.current || code === 'aborted' || code === 'no-speech') return;
          if (code === 'network') networkErrors += 1;
          if (code === 'not-allowed' || code === 'audio-capture' || networkErrors >= 2) {
            committed = true;
            setPhase('idle');
            setMessage(voiceErrorMessage(code));
          }
        },
        onend: () => {
          if (committed || current !== turn.current) return;
          if (networkErrors >= 2) return;
          restarts += 1;
          if (restarts > 8) {
            setPhase('idle');
            setMessage('잘 안 들렸어요. 다시 듣기를 눌러 주세요.');
            return;
          }
          later(listen, 400);
        },
      });
    };

    if (!voice.canSpeak) { later(listen, AFTER_SPEECH_MS); return; }
    setPhase('speaking');
    voice.speak(questionText, { onend: () => { if (current === turn.current) later(listen, AFTER_SPEECH_MS); } });
  }, [clearTimers, later, questionText, voice]);

  useEffect(() => {
    if (!questionText || paused) return undefined;
    const current = ++turn.current;
    clearTimers();
    hearingRef.current?.('');
    run(current);
    return cancel;
  }, [questionText, paused, clearTimers, run, cancel]);

  const status = phase === 'speaking' ? '질문을 읽고 있어요. 끝난 뒤에 답을 들어요.' : phase === 'listening' ? '듣고 있어요. 말씀한 뒤 잠깐 멈추면 다음 질문으로 넘어가요.' : '말로 답하거나, 아래 버튼을 눌러도 돼요.';

  return <div className="seller-voice stack">
    <p className="muted" role="status">{status}</p>
    {message && <p className="muted" role="alert">{message}</p>}
    <div className="actions">
      {phase === 'idle'
        ? <Button onClick={() => { if (paused || !questionText) return; primeMicrophone(); setMessage(''); clearTimers(); run(++turn.current); }} disabled={paused}>다시 듣고 답하기</Button>
        : <Button onClick={stop}>{phase === 'speaking' ? '질문을 읽는 중 · 멈추기' : '듣는 중 · 멈추기'}</Button>}
    </div>
  </div>;
}
