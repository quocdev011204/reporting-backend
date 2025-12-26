-- Fix predicted_delay type from integer to timestamp
ALTER TABLE "project" ALTER COLUMN "predicted_delay" TYPE TIMESTAMP(3) USING CASE 
  WHEN predicted_delay IS NULL THEN NULL
  ELSE TO_TIMESTAMP(predicted_delay)
END;
