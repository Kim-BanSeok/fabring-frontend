export const formatPrice = value => `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
export const formatLength = cm => `${new Intl.NumberFormat('ko-KR').format(Number(cm) || 0)}cm${cm && cm % 90 === 0 ? ` (${cm / 90}마)` : ''}`;
