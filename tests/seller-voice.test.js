import test from 'node:test';
import assert from 'node:assert/strict';
import { composeVoiceAnswer, createBrowserVoice, voiceErrorMessage } from '../src/react/pages/seller/sellerVoice.js';

test('spoken answers append to typed text and drop extra spaces', () => {
  assert.equal(composeVoiceAnswer('', '가로 50', ' 세로'), '가로 50 세로');
  assert.equal(composeVoiceAnswer('면', '얇아요', ''), '면 얇아요');
  assert.equal(composeVoiceAnswer('  이미 적은 답  ', '', ''), '이미 적은 답');
  assert.equal(composeVoiceAnswer('가', '나'.repeat(20), '', 5), '가 나나나');
});

test('voice errors stay in seller language', () => {
  assert.match(voiceErrorMessage('not-allowed'), /마이크 권한/);
  assert.match(voiceErrorMessage('no-speech'), /들리지 않았/);
  assert.match(voiceErrorMessage('other'), /글자로/);
});

test('browser voice reports missing speech APIs and reads the question before listening', () => {
  const missing = createBrowserVoice({});
  assert.equal(missing.canSpeak, false);
  assert.equal(missing.canListen, false);
  let ended = 0;
  missing.speak('질문', { onend: () => { ended += 1; } });
  assert.equal(ended, 1);

  const spoken = [];
  const target = {
    speechSynthesis: { cancel() {}, speak(utterance) { spoken.push(utterance.text); utterance.onend(); }, getVoices: () => [{ lang: 'ko-KR' }] },
    SpeechSynthesisUtterance: class { lang = ''; voice = null; onend = null; onerror = null; },
    SpeechRecognition: class {
      lang = '';
      continuous = false;
      start() {
        assert.equal(this.lang, 'ko-KR');
        assert.equal(this.continuous, true);
        this.onresult({ resultIndex: 0, results: [[{ transcript: '가로 50에 70' }], { isFinal: true, 0: { transcript: '가로 50에 70' } }] });
        this.onend();
      }
      stop() {}
      abort() {}
    },
  };
  const voice = createBrowserVoice(target);
  assert.equal(voice.canSpeak, true);
  assert.equal(voice.canListen, true);
  let heard = null;
  voice.speak('가로와 세로를 알려 주세요', { onend: () => { voice.listen({ onresult: (result) => { heard = result; } }); } });
  assert.equal(spoken[0], '가로와 세로를 알려 주세요');
  assert.equal(heard.finalText, '가로 50에 70');
});
