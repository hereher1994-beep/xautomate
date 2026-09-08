import AccountDetailClient from './AccountDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AccountDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <AccountDetailClient accountId={id} />;
}
