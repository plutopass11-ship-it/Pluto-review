import { redirect } from 'next/navigation';

export default function SharedRoot({ params }) {
  redirect(`/shared/${params.hash}/playlist`);
}
