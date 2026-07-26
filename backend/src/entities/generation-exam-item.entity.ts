import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('generation_exam_items')
@Index(['generationExamSessionId', 'orderIndex'], { unique: true })
export class GenerationExamItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'generation_exam_session_id', type: 'uuid' })
  generationExamSessionId: string;

  @Column({ name: 'generated_question_id', type: 'uuid' })
  generatedQuestionId: string;

  @Column({ name: 'order_index', type: 'int' })
  orderIndex: number;
}
