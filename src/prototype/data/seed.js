// Figma demonstration fixtures. These are not live users, stock, or API responses.
export const STATE_VERSION = 1;
export function createSeed() {
  const seller = { id: 'seller-1', email: 'seller@example.com', nickname: '이정원', phone_number: '010-1234-5678', seller_approval_status: 'PENDING', hasStore: true };
  const store = { id: 'store-1', store_name: '양주 원단상회', address: '경기도 양주시 평화로 1450', detail_address: '1층', phone_number: '031-000-0000', closed_days: '일요일 휴무', pickup_guide: '평일 10:00~18:00 방문 가능. 요청 후 판매자의 수락을 확인해 주세요.', description: '남은 원단을 새로운 쓰임으로 연결합니다.' };
  const base = { seller_id: seller.id, store_name: store.store_name, status: 'POSTED', material: '면', thickness: '중간 두께', color: '내추럴', width_cm: 150, length_cm: null, remaining_length_cm: null, reserved_length_cm: 0, available_length_cm: null, image_url: null, photos: ['demo-texture.png'], reject_reason: null, created_at: '2026-10-11' };
  const fabrics = [
    { ...base, id: 'fabric-scrap-1', title: '블루 스트라이프 코튼', description: '가벼운 소품에 어울리는 산뜻한 스트라이프', sale_type: 'SCRAP', price: 7000, width_cm: 140, length_cm: 90, color: '블루', thickness: '얇음', texture: 'linen' },
    { ...base, id: 'fabric-scrap-2', title: '올리브 텍스처 원단', description: '자연스러운 결감이 돋보이는 차분한 색감', sale_type: 'SCRAP', price: 5000, width_cm: 120, length_cm: 60, material: '혼방', color: '올리브', texture: 'gingham' },
    { ...base, id: 'fabric-roll-1', title: '내추럴 코튼 캔버스', description: '탄탄한 조직감의 데일리 캔버스 원단', sale_type: 'ROLL', price: 5000, remaining_length_cm: 450, available_length_cm: 450, texture: 'canvas' },
    { ...base, id: 'fabric-gauze', title: '포근한 더블 거즈', description: '부드러운 촉감의 가벼운 소품용 원단', sale_type: 'SCRAP', price: 8000, width_cm: 110, length_cm: 80, color: '아이보리', thickness: '얇음', texture: 'linen' },
    { ...base, id: 'fabric-check', title: '그린 체크 코튼', description: '선명한 체크 패턴의 면 원단', sale_type: 'ROLL', price: 6000, width_cm: 145, remaining_length_cm: 270, available_length_cm: 270, color: '그린', texture: 'gingham' },
    { ...base, id: 'fabric-denim', title: '딥 블루 데님', description: '탄탄한 데님 자투리 원단', sale_type: 'SCRAP', price: 9000, width_cm: 150, length_cm: 70, color: '블루', thickness: '두꺼움', texture: 'denim' },
    ...['내추럴 코튼 캔버스', '아이보리 코튼 거즈', '네이비 옥스퍼드', '베이지 린넨 혼방', '블루 스트라이프 면'].map((title, i) => ({ ...base, id: `fabric-pending-${i + 1}`, title, description: '판매자가 입력한 원단 정보와 치수를 확인해 주세요.', sale_type: i === 0 ? 'ROLL' : 'SCRAP', status: 'PENDING', seller_id: `seller-${i + 1}`, store_name: ['양주 원단상회', '가온 패브릭', '누리 원단점', '마루 텍스타일', '다온 원단상점'][i], price: 5000 + i * 1000, length_cm: i ? 80 : null, remaining_length_cm: i ? null : 450, available_length_cm: i ? null : 450, texture: ['canvas', 'linen', 'gingham', 'denim', 'canvas'][i], material: i === 3 ? '혼방' : '면', color: ['내추럴', '아이보리', '네이비', '베이지', '블루'][i] })),
  ];
  return { version: STATE_VERSION, session: { role: 'BUYER' }, buyer: { id: 'buyer-1', email: 'loop@example.com', nickname: '김루프', phone_number: '010-0000-0000' }, seller, store,
    sellers: [{ ...seller, store_name: store.store_name }, ...['이누리', '박다온', '최하람', '정이든'].map((nickname, i) => ({ id: `seller-${i + 2}`, email: `seller${i + 2}@example.com`, nickname, phone_number: '010-0000-0000', seller_approval_status: 'APPROVED', hasStore: true, store_name: ['가온 패브릭', '누리 원단점', '마루 텍스타일', '다온 원단상점'][i] }))],
    phase2: true, fabrics, reservations: [], inquiries: [], draft: null, upload: null, ai: null, demo: { createResult: 'SUCCESS', uploadResult: 'SUCCESS', adminResult: 'SUCCESS' } };
}
