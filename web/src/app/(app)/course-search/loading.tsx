import pageStyles from "@/components/courses/page.module.css";
import { SearchFormSkeleton } from "@/components/courses/SearchFormSkeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";

export default function Loading() {
  return (
    <div className={pageStyles.narrow}>
      <PageHeader title="Search classes" description="Live seat counts for Georgia State sections." />
      <Card>
        <SearchFormSkeleton />
      </Card>
    </div>
  );
}
