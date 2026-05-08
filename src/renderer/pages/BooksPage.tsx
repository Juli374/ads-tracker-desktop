import React from 'react';
import { PagePlaceholder } from '../components/PagePlaceholder';

export const BooksPage: React.FC = () => {
  return (
    <PagePlaceholder
      title="Книги"
      description="Список книг с drill-down: книга → маркетплейс → кампании → детали."
    />
  );
};
