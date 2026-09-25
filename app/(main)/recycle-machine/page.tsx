import { RecycleMachine } from "./machine";

export const metadata = { title: "Recycling machine" };

export default function RecycleMachinePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <div className="mt-8">
        <RecycleMachine />
      </div>
    </main>
  );
}
