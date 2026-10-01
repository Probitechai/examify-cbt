'use client'
import { useParams } from 'next/navigation'
import QuestionEditor from '../../QuestionEditor'

export default function EditQuestionPage() {
  const { id } = useParams() as { id: string }
  return <QuestionEditor questionId={id} />
}
