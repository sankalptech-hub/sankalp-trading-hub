import {
  LayoutDashboard, TrendingUp, Radar, Bookmark, Wrench, BarChart3, Layers, Clock,
  PieChart, Shield, Plug, Bell, Bot, ListChecks, Settings, LogOut,
  ShieldCheck, Sun, Moon, Activity, Cpu, Briefcase, Filter, Globe, Award, Banknote, Info,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { MarketStatusHeader } from '@/components/MarketStatusHeader';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';

const mainItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Trade', url: '/trade', icon: TrendingUp },
  { title: 'Scanner', url: '/scanner', icon: Radar },
  { title: 'Options Screener', url: '/options-screener', icon: Filter },
  { title: 'Watchlist', url: '/watchlist', icon: Bookmark },
  { title: 'Options Watchlist', url: '/options-watchlist', icon: Layers },
];

const strategyItems = [
  { title: 'Builder', url: '/builder', icon: Wrench },
  { title: 'Backtest', url: '/backtest', icon: BarChart3 },
  { title: 'Strategies', url: '/strategies', icon: Layers },
  { title: 'Expert Advisors', url: '/eas', icon: Cpu },
];

const portfolioItems = [
  { title: 'Positions', url: '/positions', icon: Briefcase },
  { title: 'History', url: '/history', icon: Clock },
  { title: 'Analytics', url: '/analytics', icon: PieChart },
  { title: 'Asset Analysis', url: '/asset-analysis', icon: Activity },
  { title: 'Stock Profile', url: '/stock-profile', icon: Info },
  { title: 'Market Analysis', url: '/market-analysis', icon: Globe },
  { title: 'Money Flow', url: '/money-flow', icon: Banknote },
  { title: 'Risk', url: '/risk', icon: Shield },
];

const marketItems = [
  { title: 'Brokers', url: '/brokers', icon: Plug },
];

const systemItems = [
  { title: 'Alerts', url: '/alerts', icon: Bell },
  { title: 'AI Assistant', url: '/ai-assistant', icon: Bot },
  { title: 'Build Tracker', url: '/build-tracker', icon: ListChecks },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const adminItems = [
  { title: 'Admin Panel', url: '/admin', icon: ShieldCheck },
];

const associateItems = [
  { title: 'Associate Hub', url: '/associate', icon: Award },
];

type NavGroup = { label: string; items: typeof mainItems };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { user, isAdmin, isAssociate, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const groups: NavGroup[] = [
    { label: 'Main', items: mainItems },
    { label: 'Strategy', items: strategyItems },
    { label: 'Portfolio', items: portfolioItems },
    { label: 'Market', items: marketItems },
    { label: 'System', items: systemItems },
  ];
  if (isAssociate || isAdmin) groups.push({ label: 'Partner', items: associateItems });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && (
              <span className="text-lg font-bold font-['Syne']">
                <span className="text-foreground">Trade</span><span className="text-primary">Sphere</span>
              </span>
            )}
          </SidebarGroupLabel>
          {!collapsed && <MarketStatusHeader />}
        </SidebarGroup>

        {groups.map(g => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{!collapsed && g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map(item => (
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
        ))}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{!collapsed && 'Admin'}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map(item => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                      <NavLink to={item.url} end className="hover:bg-accent/50" activeClassName="bg-accent text-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4 text-destructive" />
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
            <div className="flex items-center justify-between">
              <button onClick={signOut} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors">
                <LogOut className="h-3 w-3" /> Sign Out
              </button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
