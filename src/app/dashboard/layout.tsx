import SidebarShell from "@/components/SidebarShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <SidebarShell>{children}</SidebarShell>;
}
