import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Check, Trash2 } from 'lucide-react';

const typeColors: Record<string, string> = {
  info: 'border-l-blue-500 bg-blue-500/5',
  warning: 'border-l-yellow-500 bg-yellow-500/5',
  danger: 'border-l-red-500 bg-red-500/5',
  success: 'border-l-emerald-500 bg-emerald-500/5',
};

const Alerts = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);

  const fetchAlerts = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('alerts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) { toast.error(error.message); return; }
    setAlerts(data || []);
  };

  useEffect(() => { fetchAlerts(); }, [user]);

  const markRead = async (id: string) => {
    const { error } = await supabase.from('alerts').update({ read: true }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    fetchAlerts();
  };

  const deleteAlert = async (id: string) => {
    const { error } = await supabase.from('alerts').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Alert deleted');
    fetchAlerts();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Alerts</h1>
      {alerts.length === 0 ? (
        <p className="text-muted-foreground">No alerts yet.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => (
            <Card key={a.id} className={`border-l-4 ${typeColors[a.type] || typeColors.info} ${a.read ? 'opacity-60' : ''}`}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className={a.read ? 'text-muted-foreground' : ''}>{a.message}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  {!a.read && (
                    <Button variant="ghost" size="icon" onClick={() => markRead(a.id)}><Check className="h-4 w-4" /></Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => deleteAlert(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Alerts;
