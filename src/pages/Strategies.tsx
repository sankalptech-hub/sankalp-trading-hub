import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const Strategies = () => {
  const { user } = useAuth();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const fetch = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('strategies').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) { toast.error(error.message); return; }
    setStrategies(data || []);
  };

  useEffect(() => { fetch(); }, [user]);

  const addStrategy = async () => {
    if (!name.trim()) { toast.error('Strategy name is required'); return; }
    if (!user) return;
    const { error } = await supabase.from('strategies').insert({ user_id: user.id, name, description });
    if (error) { toast.error(error.message); return; }
    toast.success('Strategy added');
    setName(''); setDescription('');
    fetch();
  };

  const toggleStatus = async (id: string, current: string) => {
    const newStatus = current === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('strategies').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Strategy ${newStatus}`);
    fetch();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Strategies</h1>
      <Card className="card-glow max-w-xl">
        <CardHeader><CardTitle>Add Strategy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><Label>Name</Label><Input placeholder="Momentum Breakout" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea placeholder="Describe the strategy..." value={description} onChange={e => setDescription(e.target.value)} /></div>
          <Button onClick={addStrategy}>Add Strategy</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {strategies.map(s => (
          <Card key={s.id} className="card-glow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{s.description || 'No description'}</p>
                </div>
                <Switch checked={s.status === 'active'} onCheckedChange={() => toggleStatus(s.id, s.status)} />
              </div>
              <p className="text-xs text-muted-foreground mt-3 font-mono">{new Date(s.created_at).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Strategies;
