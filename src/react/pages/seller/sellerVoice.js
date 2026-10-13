// 브라우저 음성. 녹음 파일은 만들지 않고, 질문 읽기와 인식된 글만 다룬다.

export function composeVoiceAnswer(base, finalText, interimText, max = 1000) {
  const spoken = `${finalText || ''}${interimText || ''}`.replace(/\s+/g, ' ').trim();
  const prefix = `${base || ''}`.trim();
  const combined = !spoken ? prefix : prefix ? `${prefix} ${spoken}` : spoken;
  return combined.slice(0, max);
}

export function voiceErrorMessage(code) {
  if (code === 'not-allowed') return '마이크 권한을 허용해야 말로 답할 수 있어요.';
  if (code === 'no-speech') return '음성이 들리지 않았어요. 다시 말하거나 글자로 적어 주세요.';
  if (code === 'audio-capture') return '마이크를 찾지 못했어요. 글자로 적어 주세요.';
  if (code === 'network') return '음성 인식에 연결하지 못했어요. 글자로 적어 주세요.';
  return '말로 답하기를 마치지 못했어요. 글자로 이어서 적을 수 있어요.';
}

export function createBrowserVoice(target = globalThis) {
  const synth = target.speechSynthesis;
  const Recognition = target.SpeechRecognition || target.webkitSpeechRecognition;
  let recognition = null;

  const koreanVoice = () => (synth?.getVoices?.() || []).find((voice) => voice.lang?.toLowerCase().startsWith('ko')) || null;

  return {
    canSpeak: Boolean(synth?.speak),
    canListen: typeof Recognition === 'function',
    speak(text, { onend } = {}) {
      if (!synth?.speak || !text) { onend?.(); return; }
      synth.cancel();
      const utterance = new target.SpeechSynthesisUtterance(text);
      utterance.text = text;
      utterance.lang = 'ko-KR';
      const voice = koreanVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => onend?.();
      utterance.onerror = (event) => {
        if (event?.error === 'interrupted' || event?.error === 'canceled') return;
        onend?.();
      };
      synth.speak(utterance);
    },
    listen({ onresult, onend, onerror }) {
      if (typeof Recognition !== 'function') { onerror?.('not-supported'); onend?.(); return () => {}; }
      recognition?.abort?.();
      const session = new Recognition();
      recognition = session;
      let finals = '';
      session.lang = 'ko-KR';
      session.interimResults = true;
      session.continuous = true;
      session.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const piece = event.results[index][0]?.transcript || '';
          if (event.results[index].isFinal) finals += piece;
          else interim += piece;
        }
        onresult?.({ finalText: finals, interimText: interim });
      };
      session.onerror = (event) => onerror?.(event.error || 'unknown');
      session.onend = () => { if (recognition === session) recognition = null; onend?.(); };
      try { session.start(); }
      catch { onerror?.('aborted'); onend?.(); }
      return () => session.stop();
    },
    stopListening() {
      recognition?.stop?.();
      recognition = null;
    },
    stop() {
      synth?.cancel?.();
      this.stopListening();
    },
  };
}

let sharedVoice = null;

function sharedBrowserVoice() {
  if (!sharedVoice) sharedVoice = createBrowserVoice();
  return sharedVoice;
}

// 대화 시작을 누르는 순간에 마이크 권한을 받아 둔다. 인식이 쓰기 전에 트랙은 바로 닫는다.
export function primeMicrophone(target = globalThis) {
  const media = target.navigator?.mediaDevices;
  if (!media?.getUserMedia) return Promise.resolve(false);
  return media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((stream) => {
    stream.getTracks().forEach((track) => track.stop());
    return true;
  }).catch(() => false);
}

// 클릭 안에서 먼저 호출해야 이후 질문 읽기가 막히지 않는다.
export function unlockVoice() {
  const voice = sharedBrowserVoice();
  if (!voice.canSpeak) return;
  voice.speak('\u200b');
}

export function speakQuestion(text) {
  if (!text) return;
  sharedBrowserVoice().speak(text);
}
