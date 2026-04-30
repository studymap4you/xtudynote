import { AdminTopNav } from "@/components/AdminTopNav";
import { ClassroomListPage } from "@/pages/classroom/ClassroomListPage";
import "@/pages/pages.css";

/** 마스터 전용: `/classroom`과 동일 목록·삭제 UI, 상단은 관리자 3분할 네비 */
export function AdminClassroomsPage() {
  return (
    <div className="app-shell app-shell--admin app-shell--light">
      <AdminTopNav />
      <ClassroomListPage embedInAdminShell />
    </div>
  );
}
