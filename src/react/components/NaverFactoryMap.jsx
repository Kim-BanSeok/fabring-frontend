import { useEffect, useRef, useState } from 'react';
import { Button } from './ui.jsx';
import { FACTORY_MAP_MARGIN, FACTORY_MAP_MOVE_MS, focusFactoryMarker, groupFactoryMarkers, loadNaverMaps, showFactoryOverview, stopFactoryMapMove } from '../services/naver-maps.js';

export default function NaverFactoryMap({ items, selectedId, onSelect, focusSelected = false, focusRevision = 0, clientId = import.meta.env.VITE_NAVER_MAPS_CLIENT_ID || '' }) {
  const container = useRef(null), mapRef = useRef(null), boundsRef = useRef(null), markers = useRef([]), selectRef = useRef(onSelect);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  const [error, setError] = useState(''), [readyMap, setReadyMap] = useState(null), [attempt, setAttempt] = useState(0);
  const ready = readyMap !== null;
  const groupsKey = JSON.stringify(groupFactoryMarkers(items));
  useEffect(() => {
    let active = true, maps, initListener;
    const element = container.current;
    loadNaverMaps(clientId).then((sdk) => {
      if (!active) return;
      setReadyMap(null);
      maps = sdk;
      const map = new sdk.Map(element, { center: new sdk.LatLng(37.7853, 127.0458), zoom: 10, gl: true, zoomControl: true, tileDuration: 120 });
      mapRef.current = map;
      const groups = JSON.parse(groupsKey), bounds = new sdk.LatLngBounds();
      markers.current = groups.map((group) => {
        const position = new sdk.LatLng(group.latitude, group.longitude);
        const marker = new sdk.Marker({ map, position, title: group.factories.map((item) => item.name).join(', ') });
        const listener = sdk.Event.addListener(marker, 'click', () => selectRef.current(group.factories[0].id));
        bounds.extend(position);
        return { marker, listener, group };
      });
      boundsRef.current = bounds;
      const onReady = () => {
        if (!active) return;
        if (groups.length > 1) map.fitBounds(bounds, FACTORY_MAP_MARGIN);
        else if (groups.length === 1) map.setCenter(new sdk.LatLng(groups[0].latitude, groups[0].longitude));
        setError(''); setReadyMap(map);
      };
      // GL 초기화가 끝나야 첫 위치 이동이 초기 카메라 설정에 덮어쓰이지 않는다.
      initListener = sdk.Event.once(map, 'init', onReady);
      if (map.isGLReady?.()) { sdk.Event.removeListener(initListener); onReady(); }
    }).catch((failure) => { if (active) { setReadyMap(null); setError(failure.message); } });
    return () => {
      active = false;
      if (initListener) maps?.Event.removeListener(initListener);
      for (const item of markers.current) { maps?.Event.removeListener(item.listener); item.marker.setMap(null); }
      markers.current = [];
      if (mapRef.current) { stopFactoryMapMove(mapRef.current); mapRef.current.destroy(); }
      mapRef.current = null; boundsRef.current = null;
      element?.replaceChildren();
    };
  }, [clientId, groupsKey, attempt]);
  useEffect(() => {
    if (!readyMap || readyMap !== mapRef.current) return;
    for (const item of markers.current) {
      const selected = item.group.factories.some((factory) => factory.id === selectedId);
      item.marker.setZIndex(selected ? 100 : 0);
      if (selected && focusSelected && mapRef.current) focusFactoryMarker(mapRef.current, item.marker);
    }
  }, [selectedId, readyMap, groupsKey, focusSelected, focusRevision]);
  const showOverview = () => {
    if (!readyMap || readyMap !== mapRef.current || !boundsRef.current) return;
    if (markers.current.length > 1) showFactoryOverview(mapRef.current, boundsRef.current);
    else if (markers.current.length === 1) {
      stopFactoryMapMove(mapRef.current);
      mapRef.current.morph(markers.current[0].marker.getPosition(), 10, { duration: FACTORY_MAP_MOVE_MS, easing: 'easeOutCubic' });
    }
  };
  const located = items.filter((item) => item.latitude !== null && item.longitude !== null).length;
  return <div className="factory-map">
    <div ref={container} className="factory-map-canvas" aria-label="양주시 부자재 관련 공장 지도" />
    {!ready && <div className="factory-map-feedback" role="status"><p>{error || '지도를 불러오고 있어요…'}</p>{error && clientId && <Button onClick={() => { setError(''); setAttempt((value) => value + 1); }}>지도 다시 연결</Button>}</div>}
    {ready && <Button className="factory-map-overview" onClick={showOverview}>전체 위치</Button>}
    {ready && <span className="factory-map-caption">{located ? `위치 확인 ${located}곳 · 미확인 ${items.length - located}곳` : '업체 위치 확인 중 · 주소는 목록에서 확인해 주세요.'}</span>}
  </div>;
}
