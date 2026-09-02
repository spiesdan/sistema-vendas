import '@/app/globals.css';
import { CustomerDetailView } from '@/app/customers/customer-detail-view';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailView id={id} />;
}