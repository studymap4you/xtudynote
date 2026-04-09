import { useNavigate } from "react-router-dom";
import "@/pages/pages.css";

export function AddMaterialButton() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="btn btn--primary btn--stack"
      onClick={() => {
        window.alert("마스터의 검수 후 2~3일 내에 등록됩니다.");
        navigate("/material/register");
      }}
    >
      <span className="ui-en">+ Add Material</span>
      <span className="ui-ko">자료 등록</span>
    </button>
  );
}
