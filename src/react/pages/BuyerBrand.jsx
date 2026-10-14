import { FabricImage } from '../components/ui.jsx';
import useFabricResource from '../hooks/useFabricResource.js';
import { detailPath, priceText } from './buyer-model.js';

const values = [
  ['leaf', '지속 가능한 순환', '버려지는 원단을 다시 가치 있는 자원으로'],
  ['store', '다양한 원단 거래', '개인부터 매장까지, 남은 롤과 자투리를 함께'],
  ['spark', 'AI 맞춤 추천', '고른 원단의 폭과 길이에 맞는 도안을 골라 드려요'],
  ['people', '함께하는 작업실', '원단과 아이디어, 만드는 사람이 만나는 자리'],
];

const steps = [
  ['search', '원단 검색하기', '용도에 맞는 롤과 자투리를 사진과 치수로 찾습니다.'],
  ['spark', '도안 추천받기', '고른 원단으로 만들 수 있는 도안을 이어서 봅니다.'],
  ['calendar', '픽업 예약하기', '날짜를 정하고 양주 매장에서 실물을 받습니다.'],
  ['scissors', '창작하기', '받은 천으로 가방, 소품, 다음 작업을 만듭니다.'],
];

function Icon({ name }) {
  const common = { viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'leaf') return <svg {...common}><path d="M7 25c8-1 14-8 16-18-8 1-15 7-16 18Z" /><path d="M12 20c3-3 6-5 10-7" /></svg>;
  if (name === 'store') return <svg {...common}><path d="M6 13h20l-2 14H8L6 13Z" /><path d="M6 13l2.5-6h15L26 13" /><path d="M13 27v-7h6v7" /></svg>;
  if (name === 'spark') return <svg {...common}><path d="M16 5v6M16 21v6M5 16h6M21 16h6M8.5 8.5l4 4M19.5 19.5l4 4M23.5 8.5l-4 4M12.5 19.5l-4 4" /></svg>;
  if (name === 'people') return <svg {...common}><circle cx="11" cy="11" r="3" /><circle cx="21" cy="12" r="2.5" /><path d="M5 24c1.2-4 3.4-6 6-6s4.8 2 6 6M18 24c.7-2.4 2-4 4-4 1.6 0 2.8.8 3.6 2.4" /></svg>;
  if (name === 'search') return <svg {...common}><circle cx="14" cy="14" r="6" /><path d="M19 19l6 6" /></svg>;
  if (name === 'calendar') return <svg {...common}><rect x="6" y="8" width="20" height="16" rx="2" /><path d="M6 13h20M11 6v4M21 6v4" /></svg>;
  return <svg {...common}><circle cx="10" cy="20" r="3" /><circle cx="22" cy="20" r="3" /><path d="M13 20h6M12 12l8-4" /></svg>;
}

function Wordmark() {
  return <>
    <span className="loop-word-ko">패브링<Icon name="leaf" /></span>
  </>;
}

function PickCard({ ctx, fabric }) {
  const route = `#${detailPath(ctx, fabric)}`;
  return <article className="loop-card">
    <a href={route} aria-label={`${fabric.title} 상세 보기`}>
      <FabricImage fabric={fabric} exampleLabel={false} />
      <span className="loop-card-kind">{fabric.sale_type === 'ROLL' ? '롤' : '자투리'}</span>
    </a>
    <h3><a href={route}>{fabric.title}</a></h3>
    <p>{[fabric.material, fabric.color, fabric.thickness].filter(Boolean).join(' · ')}</p>
    <strong>{priceText(fabric)}</strong>
  </article>;
}

export default function BuyerBrand({ ctx }) {
  const resource = useFabricResource(ctx?.api, ctx?.api ? { kind: 'list', query: { sale_type: 'SCRAP', sort: 'latest', page: 0, size: 4 } } : null);
  const fabrics = resource.data?.content || [];
  const thumbs = fabrics.filter(fabric => fabric.image_url).slice(0, 3);
  return <article className="loop-brand">
    <section className="loop-hero">
      <div className="loop-hero-copy">
        <p className="loop-script loop-script--hero">버려질 뻔한 원단이<br />다시, 누군가의 작품이 되는 천</p>
        <h1 className="loop-word"><Wordmark /></h1>
        <p className="loop-kicker">지속 가능한 패션과 더 나은 내일을 위한<br />원단 순환 플랫폼, 패브링</p>
        <p className="loop-intro">쓰지 않고 남은 원단이 다음 작업을 만나는 곳입니다. 판매자가 롤과 자투리를 올리고, 구매자는 치수를 확인한 뒤 양주 매장에서 받아 갑니다.</p>
        <a className="loop-cta" href="#/buyer/fabrics">원단 둘러보기 →</a>
      </div>
      <figure className="loop-hero-photo">
        <img src="/assets/brand/loop-hero.jpg" alt="노란 테이블 위에 쌓인 롤 원단과 무지 에코백, 사과" />
        <p className="loop-script loop-script--photo">좋은 원단은<br />언제나 다시<br />쓰일 수 있어요</p>
      </figure>
    </section>

    <ul className="loop-values">
      {values.map(([icon, title, text]) => <li key={title}><Icon name={icon} /><strong>{title}</strong><p>{text}</p></li>)}
    </ul>

    <section className="loop-how" aria-labelledby="loop-how-title">
      <div>
        <h2 id="loop-how-title">이렇게 이용해보세요</h2>
        <p className="loop-how-lead">원단을 고르는 데서 끝나지 않습니다. 치수에 맞는 도안을 보고, 매장에서 받아 바로 작업할 수 있습니다.</p>
        <ol className="loop-steps">
          {steps.map(([icon, title, text], index) => <li key={title}>
            <div className="loop-step-index"><span>{index + 1}</span><i /></div>
            <Icon name={icon} />
            <strong>{title}</strong>
            <p>{text}</p>
          </li>)}
        </ol>
      </div>
      <figure className="loop-craft">
        <p className="loop-script loop-script--craft">아이디어가<br />현실이 되는 순간</p>
        <img src="/assets/brand/loop-craft.jpg" alt="체크 원단, 재단 가위, 가방 스케치가 놓인 작업 테이블" />
      </figure>
    </section>

    <section className="loop-picks" aria-labelledby="loop-picks-title">
      <p className="loop-script loop-script--picks">좋은 원단, 좋은 사람들</p>
      <div className="loop-picks-head">
        <div>
          <h2 id="loop-picks-title">지금, 올라온 원단을 만나보세요</h2>
          <p>게시된 자투리를 치수와 가격까지 확인하고 바로 열어볼 수 있습니다.</p>
        </div>
        <a className="loop-picks-link" href="#/buyer/fabrics">전체 원단 보기 →</a>
      </div>
      {resource.loading ? <p className="loop-note" role="status">원단을 불러오고 있어요.</p> : null}
      {resource.error ? <p className="loop-note">원단 목록을 불러오지 못했어요. <button type="button" onClick={resource.retry}>다시 시도</button></p> : null}
      {!resource.loading && !resource.error && fabrics.length === 0 ? <div className="loop-empty"><p>아직 게시된 자투리가 없습니다. 운영 확인이 끝나면 사진, 치수, 가격이 이 자리에 놓입니다.</p><a className="loop-cta" href="#/buyer/fabrics">원단 목록 열기 →</a></div> : null}
      {fabrics.length > 0 ? <div className="loop-grid">{fabrics.map(fabric => <PickCard key={fabric.id} ctx={ctx} fabric={fabric} />)}</div> : null}
    </section>

    <section className="loop-ai" aria-labelledby="loop-ai-title">
      <svg className="loop-bot" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="48" r="28" fill="#e7f6d8" />
        <rect x="24" y="34" width="40" height="30" rx="12" fill="#1b7a34" />
        <circle cx="36" cy="48" r="4" fill="#f6f1e4" />
        <circle cx="52" cy="48" r="4" fill="#f6f1e4" />
        <path d="M36 56h16" stroke="#f6f1e4" strokeWidth="2" strokeLinecap="round" />
        <path d="M44 22v8" stroke="#e7f6d8" strokeWidth="3" strokeLinecap="round" />
        <circle cx="44" cy="18" r="4" fill="#d7f5c4" />
      </svg>
      <div>
        <h2 id="loop-ai-title">고른 원단에 맞는 도안</h2>
        <p>원단을 열면 폭, 길이, 소재를 등록된 도안과 비교해 만들 수 있는 작업을 보여 줍니다.</p>
        <a className="loop-cta" href="#/buyer/fabrics">원단 고르고 도안 보기 →</a>
      </div>
      <div className="loop-ai-aside">
        <p className="loop-script loop-script--ai">가방을 만들고 싶은데,<br />어떤 천이 맞을까요?</p>
        {thumbs.length > 0 ? <div className="loop-thumbs">{thumbs.map(fabric => <FabricImage key={fabric.id} fabric={fabric} exampleLabel={false} compact />)}</div> : null}
      </div>
    </section>

    <section className="loop-close" aria-label="패브링 시작">
      <img src="/assets/brand/loop-city.jpg" alt="" />
      <div className="loop-close-shade" />
      <div className="loop-close-copy">
        <p className="loop-script loop-script--foot">작은 연결이<br />큰 변화를 만듭니다</p>
        <div className="loop-close-mark">
          <p className="loop-word"><Wordmark /></p>
          <p>지속 가능한 내일, 함께 만들어요.</p>
          <a className="loop-cta" href="#/buyer/fabrics">지금 시작하기 →</a>
        </div>
        <p className="loop-script loop-script--foot">원단이 다시<br />흐르는 세상,<br />패브링</p>
      </div>
    </section>
  </article>;
}
