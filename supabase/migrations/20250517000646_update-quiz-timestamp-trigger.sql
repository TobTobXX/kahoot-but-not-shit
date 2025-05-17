-- Create function to update parent quiz timestamp
CREATE OR REPLACE FUNCTION update_quiz_timestamp_on_question_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the parent quiz's updated_at timestamp
  UPDATE quizzes 
  SET updated_at = NOW() 
  WHERE id = NEW.quiz_id OR id = OLD.quiz_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for questions table
CREATE TRIGGER update_quiz_timestamp_on_question_insert
AFTER INSERT ON questions
FOR EACH ROW EXECUTE FUNCTION update_quiz_timestamp_on_question_change();

CREATE TRIGGER update_quiz_timestamp_on_question_update
AFTER UPDATE ON questions
FOR EACH ROW EXECUTE FUNCTION update_quiz_timestamp_on_question_change();

CREATE TRIGGER update_quiz_timestamp_on_question_delete
AFTER DELETE ON questions
FOR EACH ROW EXECUTE FUNCTION update_quiz_timestamp_on_question_change();