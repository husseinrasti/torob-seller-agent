import { AssistantApp } from '@/components/app/assistant-app';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const demoTime = typeof sp.demo_time === 'string' ? sp.demo_time : null;
  return <AssistantApp demoTime={demoTime} />;
}
