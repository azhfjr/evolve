import { Logo } from "./ui";
export function RoomLoading({ name }: { name: string }) {
  return (
    <main className="room-loading" aria-busy="true">
      <Logo name={name} />
      <p role="status">Opening {name}…</p>
      <div className="room-loading-skeleton" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </main>
  );
}
