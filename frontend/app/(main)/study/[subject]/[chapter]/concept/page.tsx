'use client';

import { ConceptStudyPage } from '@widgets/ConceptStudy';

export default function Page({
  params,
}: {
  params: Promise<{ subject: string; chapter: string }>;
}) {
  return <ConceptStudyPage params={params} />;
}
