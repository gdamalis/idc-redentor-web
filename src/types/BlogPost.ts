export type BlogPost = {
  id: number;
  title: string;
  description: string;
  content: string;
  imageUrl: string;
  date: string;
  datetime: string;
  author: {
    name: string;
    imageUrl: string;
  };
  keywords: string;
  ogDescription: string;
  slug: string;
};
