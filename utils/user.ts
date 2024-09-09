import { createClient } from './supabase/server';

const supabase = createClient();

export const getUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
};

export const getUserName = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: userName, error } = await supabase
    .from('users')
    .select('name')
    .eq('id', user?.id)
    .single();

  if (error) {
    console.error('Error fetching username:', error);
    return null;
  }

  return userName?.name || null;
};
