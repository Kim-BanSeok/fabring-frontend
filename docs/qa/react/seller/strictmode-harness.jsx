// Isolated test fixture; not imported by the application entry or production build.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SellerPage from '/src/react/pages/SellerPage.jsx';
import { createScenarioApi } from '/src/prototype/data/scenarios.js';

export async function mountSellerTest({ node, path, query = '', demo }) {
  const target = document.createElement('div'); target.id = 'seller-test-host'; document.body.append(target);
  const root = createRoot(target), original = createScenarioApi(node), counts = {}, routes = [], errors = [];
  await original.setRole('SELLER'); if (demo) await original.setDemo(demo);
  const api = new Proxy(original, { get(object, key) {
    const value = object[key];
    if (typeof value !== 'function' || key === 'getState') return value;
    return (...args) => { counts[key] = (counts[key] || 0) + 1; return value(...args); };
  } });
  const drafts = new Map();
  function Fixture() {
    const [route, setRoute] = useState(`${path}${query ? '?' + query : ''}`), [state, setState] = useState(api.getState());
    const [pathname, search] = route.split('?');
    const ctx = {
      path: pathname, query: new URLSearchParams(search), state, api, drafts, scenario: node,
      refresh: async () => setState(api.getState()),
      navigate: next => { routes.push(next); setState(api.getState()); setRoute(next); },
      notify: message => errors.push(message), logout() {},
    };
    return <SellerPage key={route} ctx={ctx} />;
  }
  root.render(<StrictMode><Fixture /></StrictMode>);
  return { counts, routes, errors, state: () => api.getState(), unmount: () => { root.unmount(); target.remove(); } };
}
