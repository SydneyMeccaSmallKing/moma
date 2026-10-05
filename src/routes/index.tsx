import { createFileRoute } from "@tanstack/react-router";
import { QrStudio } from "@/components/qr-studio";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main>
      <QrStudio />
    </main>
  );
}
