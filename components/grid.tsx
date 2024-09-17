import { BentoGrid, BentoGridItem } from './ui/bento-grid';

const Grid = () => {
  return (
    <section id='about'>
      <BentoGrid>
        {[{ title: 'uno', description: 'desc1' }].map((item, i) => (
          <BentoGridItem></BentoGridItem>
        ))}
      </BentoGrid>
    </section>
  );
};

export default Grid;
