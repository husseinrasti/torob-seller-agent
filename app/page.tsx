import { AssistantApp } from '@/components/app/assistant-app';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);
  return <AssistantApp initialChatId={one(sp.c)} demoTime={one(sp.demo_time)} />;
}
