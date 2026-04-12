import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Activity, LayoutDashboard, Settings, PieChart, Briefcase, ScanLine, Users } from "lucide-react";
import Dashboard from "./pages/dashboard";
import Trades from "./pages/trades";
import Stats from "./pages/stats";
import Config from "./pages/config";
import Positions from "./pages/positions";
import Bots from "./pages/bots";
import Scanner from "./pages/scanner";
import NotFound from "./pages/not-found";
import { useListBots } from "@workspace/api-client-react";

const queryClient = new QueryClient();

function NavBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-success/20 text-success text-[10px] font-mono font-bold">
      {count}
    </span>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: bots = [] } = useListBots({ query: { refetchInterval: 10000 } });
  const activeBotCount = bots.filter((b) => b.phase !== "closed").length;

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, badge: 0 },
    { href: "/bots", label: "Bot Swarm", icon: Users, badge: activeBotCount },
    { href: "/scanner", label: "Scanner", icon: ScanLine, badge: 0 },
    { href: "/trades", label: "Trades", icon: Activity, badge: 0 },
    { href: "/stats", label: "Stats", icon: PieChart, badge: 0 },
    { href: "/positions", label: "Positions", icon: Briefcase, badge: 0 },
    { href: "/config", label: "Config", icon: Settings, badge: 0 },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row dark">
      <aside className="w-full md:w-64 bg-card border-r border-border md:min-h-screen flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-primary-foreground font-bold">
            O
          </div>
          <div className="font-bold tracking-tight text-lg">ORB Bot</div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-x-auto md:overflow-y-auto flex md:flex-col">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
                <NavBadge count={item.badge} />
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/bots" component={Bots} />
        <Route path="/scanner" component={Scanner} />
        <Route path="/trades" component={Trades} />
        <Route path="/stats" component={Stats} />
        <Route path="/config" component={Config} />
        <Route path="/positions" component={Positions} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
