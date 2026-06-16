// Tab title for every /contracts/* route (absolute → overrides the root template).
// Contracts Studio is its own module; each page renders <ContractsStudioShell>.
export const metadata = { title: { absolute: 'Contracts Studio' } };

export default function ContractsLayout({ children }) {
  return children;
}
