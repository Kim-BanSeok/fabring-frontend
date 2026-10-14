import { Field } from '../../components/ui.jsx';

export default function RollSaleUnit() {
  return <div className="seller-roll-sale-unit">
    <Field label="1마의 길이 (고정)" name="roll_unit_length" value="90cm" readOnly hint="롤 원단은 길이 90cm를 1마로 판매해요. 폭은 실제 원단 폭을, 재고는 전체 남은 길이를 입력해 주세요." />
  </div>;
}
