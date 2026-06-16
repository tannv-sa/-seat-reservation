import CheckoutClient from './CheckoutClient'

// Next.js 16: params is a Promise
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ seatId: string }>
}) {
  const { seatId } = await params
  return <CheckoutClient seatId={seatId} />
}
