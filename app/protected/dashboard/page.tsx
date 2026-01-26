'use client';

import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Store,
  Camera,
  TrendingUp,
  MapPin,
  Users,
  CheckCircle,
  RefreshCw,
  XCircle,
  FileText,
  Sticker,
  CreditCard,
  Building2,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { fetchUserStores } from '@/utils/stores';
import { useEffect, useState } from 'react';
import { getStatusLabel } from '@/utils/utils';

export default function DashboardPage() {
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadRecentActivities() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const storesData = await fetchUserStores(user.id);
          // Prendi solo le ultime 5 attività
          setRecentActivities(storesData.slice(0, 5));
        }
      } catch (error) {
        console.error('Error loading activities:', error);
      } finally {
        setLoading(false);
      }
    }

    loadRecentActivities();
  }, []);

  // Mock data per i prospect consigliati
  const recommendedProspects = [
    {
      id: 1,
      name: 'Farmacia Centrale',
      category: 'Sanità',
      address: 'Via Roma 45',
      cap: '00100',
      comune: 'Roma',
      provincia: 'RM',
      tier: 'gold',
      fatturato: '€ 500K',
    },
    {
      id: 2,
      name: 'Ristorante La Pergola',
      category: 'Ristorazione',
      address: 'Via dei Giardini 12',
      cap: '20121',
      comune: 'Milano',
      provincia: 'MI',
      tier: 'silver',
      fatturato: '€ 300K',
    },
    {
      id: 3,
      name: 'Boutique Fashion',
      category: 'Commercio',
      address: 'Corso Vittorio Emanuele 78',
      cap: '10121',
      comune: 'Torino',
      provincia: 'TO',
      tier: 'bronze',
      fatturato: '€ 200K',
    },
  ];

  // Mock KPI data
  const kpis = [
    {
      id: 'visite',
      label: 'Numero Visite',
      value: '24',
      icon: Store,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      id: 'accettano',
      label: 'Clienti che Accettano',
      value: '8',
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      id: 'estensioni',
      label: 'Estensioni',
      value: '5',
      icon: RefreshCw,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      id: 'annullati',
      label: 'Clienti Annullati',
      value: '3',
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      id: 'ricontrattualizzati',
      label: 'Ricontrattualizzati',
      value: '12',
      icon: FileText,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      id: 'vetrofania',
      label: 'Vetrofania',
      value: '6',
      icon: Sticker,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    },
    {
      id: 'non-transante',
      label: 'Cliente Non Transante',
      value: '4',
      icon: CreditCard,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      id: 'altro-gestore',
      label: 'Altro Gestore',
      value: '2',
      icon: Building2,
      color: 'text-gray-500',
      bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    },
  ];

  return (
    <div className='container mx-auto px-4 py-8 max-w-7xl'>
      {/* Header con tasto torna alla mappa */}
      <div className='flex items-center justify-between mb-8'>
        <h1 className='text-3xl font-bold'>Dashboard</h1>
        <Link href='/protected'>
          <Button variant='outline'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Torna alla mappa
          </Button>
        </Link>
      </div>

      {/* KPI Section */}
      <div className='grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 mb-8'>
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.id}
              className={`${kpi.bgColor} rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm`}
            >
              <div className='flex items-center justify-between mb-2'>
                <Icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <p className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1'>
                {kpi.value}
              </p>
              <p className='text-xs text-gray-600 dark:text-gray-400 leading-tight'>
                {kpi.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Due riquadri affiancati */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Riquadro Ultime Attività */}
        <div className='bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm'>
          <div className='flex items-center gap-2 mb-4'>
            <TrendingUp className='h-5 w-5 text-blue-500' />
            <h2 className='text-xl font-semibold'>Ultime Attività</h2>
          </div>
          {loading ? (
            <div className='text-center text-gray-500 py-8'>Caricamento...</div>
          ) : recentActivities.length > 0 ? (
            <div className='space-y-3'>
              {recentActivities.map((activity, index) => (
                <div
                  key={index}
                  className='flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors'
                >
                  {activity.type === 'photo' ? (
                    <Camera className='h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0' />
                  ) : (
                    <Store className='h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0' />
                  )}
                  <div className='flex-1 min-w-0'>
                    <p className='font-medium text-sm truncate'>
                      {activity.store_name}
                    </p>
                    <p className='text-xs text-gray-500 truncate'>
                      {activity.address}
                      {activity.cap && `, ${activity.cap}`}
                      {activity.comune && ` ${activity.comune}`}
                    </p>
                    {activity.type === 'photo' ? (
                      <p className='text-xs text-blue-600 mt-1'>
                        Foto scattata{' '}
                        {new Date(activity.created_at).toLocaleDateString('it-IT', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    ) : (
                      <p className='text-xs text-gray-600 mt-1'>
                        {getStatusLabel(activity.status)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className='text-center text-gray-500 py-8'>
              Nessuna attività recente
            </div>
          )}
        </div>

        {/* Riquadro Prospect Consigliati */}
        <div className='bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm'>
          <div className='flex items-center gap-2 mb-4'>
            <MapPin className='h-5 w-5 text-green-500' />
            <h2 className='text-xl font-semibold'>Prospect Consigliati</h2>
          </div>
          <div className='space-y-3'>
            {recommendedProspects.map((prospect) => (
              <div
                key={prospect.id}
                className='flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors'
              >
                <Store className='h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0' />
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2 mb-1'>
                    <p className='font-medium text-sm truncate'>
                      {prospect.name}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        prospect.tier === 'gold'
                          ? 'bg-yellow-100 text-yellow-800'
                          : prospect.tier === 'silver'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {prospect.tier.toUpperCase()}
                    </span>
                  </div>
                  <p className='text-xs text-gray-500 truncate'>
                    {prospect.category}
                  </p>
                  <p className='text-xs text-gray-500 truncate'>
                    {prospect.address}, {prospect.cap} {prospect.comune} ({prospect.provincia})
                  </p>
                  <p className='text-xs text-green-600 font-medium mt-1'>
                    {prospect.fatturato}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
