-- migration-009-default-classes.sql
-- Backfill "Admin" and "Admissions" classes for every existing campus
-- that doesn't already have them.

INSERT INTO pep_classes (name, campus_id)
SELECT 'Admin', c.id
FROM pep_campuses c
WHERE NOT EXISTS (
  SELECT 1 FROM pep_classes cl
  WHERE cl.campus_id = c.id AND cl.name = 'Admin'
);

INSERT INTO pep_classes (name, campus_id)
SELECT 'Admissions', c.id
FROM pep_campuses c
WHERE NOT EXISTS (
  SELECT 1 FROM pep_classes cl
  WHERE cl.campus_id = c.id AND cl.name = 'Admissions'
);
