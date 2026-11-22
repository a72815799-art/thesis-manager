/** 저장하지 않은 입력이 있는지 화면 간에 공유한다(메뉴 이동 전 확인용). */
let dirty = false;
export function setUnsaved(v: boolean) {
  dirty = v;
}
/** 이동해도 되면 true. 저장하지 않은 입력이 있으면 사용자에게 묻는다. */
export function confirmLeave(): boolean {
  if (!dirty) return true;
  const ok = window.confirm('저장하지 않은 변경이 있습니다. 저장하지 않고 이동하면 입력한 내용이 사라집니다. 이동할까요?');
  if (ok) dirty = false;
  return ok;
}
