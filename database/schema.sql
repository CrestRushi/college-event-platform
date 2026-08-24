CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS registrations (
  id BIGSERIAL PRIMARY KEY,
  registration_id VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  college_name VARCHAR(200) NOT NULL,
  event_id INTEGER NOT NULL REFERENCES events(id),
  document_s3_key TEXT,
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO events (name, description) VALUES
  ('Hackathon', '24-hour coding competition'),
  ('AI Workshop', 'Hands-on introduction to practical AI'),
  ('Cloud Computing Challenge', 'Build a cloud-ready solution'),
  ('Web Development Competition', 'Create an engaging web experience'),
  ('Cybersecurity Challenge', 'Solve practical security scenarios')
ON CONFLICT (name) DO NOTHING;
