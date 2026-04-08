import {
  LayoutDashboard, TrendingUp, Layers, Bell, BarChart3, ListChecks, LogOut, Shield, ShieldCheck, Bot,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';

const navItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Trade', url: '/trade', icon: TrendingUp },
  { title: 'Strategies', url: '/strategies', icon: Layers },
  { title: 'Alerts', url: '/alerts', icon: Bell },
  { title: 'Analytics', url: '/analytics', icon: BarChart3 },
  { title: 'Build Tracker', url: '/build-tracker', icon: ListChecks },
  { title: 'AI Assistant', url: '/ai-assistant', icon: Bot },
];

const adminItems = [
  { title: 'Admin Panel', url: '/admin', icon: ShieldCheck },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && (
              <span className="text-lg font-bold font-['Syne']">
                <span className="text-primary">Sankalp</span> OS
              </span>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink to={item.url} end className="hover:bg-accent/50" activeClassName="bg-accent text-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{!collapsed && 'Admin'}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                      <NavLink to={item.url} end className="hover:bg-accent/50" activeClassName="bg-accent text-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-4">
        {!collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground truncate flex-1">{user?.email}</p>
              {isAdmin && <Badge variant="outline" className="text-primary border-primary text-[10px]"><Shield className="h-3 w-3 mr-1"/>Admin</Badge>}
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors w-full"
            >
              <LogOut className="h-3 w-3" /> Sign Out
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
