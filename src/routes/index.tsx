import DataProvider from "@/DataProvider";
import { diagramInputSchema } from "@/diagramInputSchema";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
  validateSearch: diagramInputSchema,
});

function Index() {
  const search = Route.useSearch();

  return <DataProvider {...search} />;
}
