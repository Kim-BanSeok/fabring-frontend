const loads = new WeakMap();
export const FACTORY_MAP_MARGIN = { top: 48, right: 32, bottom: 48, left: 48 };
export const FACTORY_MAP_MOVE_MS = 300;
const transition = () => ({ duration: FACTORY_MAP_MOVE_MS, easing: 'easeOutCubic' });

export function stopFactoryMapMove(map) {
  map.stop();
}

export function showFactoryOverview(map, bounds) {
  stopFactoryMapMove(map);
  map.panToBounds(bounds, transition(), FACTORY_MAP_MARGIN);
}

export function focusFactoryMarker(map, marker) {
  // 벡터 지도 15는 기존 이미지 지도 16과 같은 배율이다. 이미 더 확대했다면 유지한다.
  const detailZoom = map.isGLReady?.() ? 15 : 16;
  const zoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), detailZoom));
  const position = marker.getPosition();
  stopFactoryMapMove(map);
  // GL은 이동과 실수 배율 확대를 한 전환에서 처리하므로 마지막에 배율이 튀지 않는다.
  map.morph(position, zoom, transition());
}

export function loadNaverMaps(clientId, target = window) {
  if (!clientId) return Promise.reject(new Error('지도 연결을 준비하고 있어요. 업체 주소는 목록에서 확인할 수 있어요.'));
  if (target.naver?.maps) return Promise.resolve(target.naver.maps);
  if (loads.get(target)?.key === clientId) return loads.get(target).promise;
  const promise = new Promise((resolve, reject) => {
    const script = target.document.createElement('script');
    const callbackName = '__fabringNaverMapsReady';
    const previousFailure = target.navermap_authFailure;
    const failure = () => finish(new Error('지도를 연결하지 못했어요. 업체 주소는 목록에서 확인해 주세요.'));
    const timer = target.setTimeout(() => finish(new Error('지도를 불러오는 데 시간이 걸려요. 잠시 후 다시 시도해 주세요.')), 15000);
    let settled = false;
    function finish(error) {
      if (settled) return;
      settled = true;
      target.clearTimeout(timer);
      delete target[callbackName];
      if (target.navermap_authFailure === failure) target.navermap_authFailure = previousFailure;
      script.onerror = null;
      script.onload = null;
      if (error) { script.remove(); loads.delete(target); reject(error); }
      else resolve(target.naver.maps);
    }
    // SDK의 콜백이 같은 스크립트 안에서 maps 전역 공개보다 먼저 실행될 수 있다.
    target[callbackName] = () => queueMicrotask(() => target.naver?.maps ? finish() : failure());
    target.navermap_authFailure = failure;
    // 일반 Web Dynamic Map으로 로드한다. GL(vector) 모듈은 애플리케이션 설정에
    // 별도 권한이 필요할 수 있어, 권한이 없는 키에서는 SDK 초기화가 끝나지 않는다.
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?${new URLSearchParams({ ncpKeyId: clientId, callback: callbackName })}`;
    script.async = true;
    script.onerror = failure;
    // 기본 스크립트의 load보다 GL 모듈 완료 콜백을 기다린다.
    target.document.head.appendChild(script);
  });
  loads.set(target, { key: clientId, promise });
  return promise;
}

export function groupFactoryMarkers(items) {
  const groups = new Map();
  for (const item of items) {
    if (item.latitude === null || item.longitude === null) continue;
    const key = `${item.latitude},${item.longitude}`;
    if (!groups.has(key)) groups.set(key, { latitude: item.latitude, longitude: item.longitude, factories: [] });
    groups.get(key).factories.push(item);
  }
  return [...groups.values()];
}
