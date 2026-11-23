import FamilyShell from "./FamilyShell";

// Activity, Vault and Albums share the family shell: a fixed sidebar on
// desktop, a pill strip on phones.
export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return <FamilyShell>{children}</FamilyShell>;
}
