'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TelegramRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/telegram/connection'); }, [router]);
  return null;
}
