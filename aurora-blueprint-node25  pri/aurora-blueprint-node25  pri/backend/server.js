const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const upload = multer({ dest: path.join(__dirname, 'uploads/') });

app.post('/api/upload', upload.single('blueprint'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const url = `http://localhost:5000/uploads/${path.basename(req.file.path)}`;
  res.json({ url });
});

app.post('/api/analyze', (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'no url provided' });

    const filename = url.split('/').pop();
    const localPath = path.join(__dirname, 'uploads', filename);

    // Ensure the python script path is correct
    const pyPath = path.join(__dirname, '..', 'python', 'analyze.py');

    // Use Windows launcher `py` (you verified this works)
    const py = spawn('py', [pyPath, localPath]);

    let out = '', err = '';

    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());

    py.on('error', spawnErr => {
      console.error('failed to start python process', spawnErr);
      return res.status(500).json({ error: 'failed to start python process', details: spawnErr.message });
    });

    py.on('close', code => {
      if (code !== 0) {
        console.error('python error', err);
        return res.status(500).json({ error: 'analysis failed', details: err });
      }

      try {
        const result = JSON.parse(out);
        return res.json(result);
      } catch (e) {
        console.error('parse error', e, 'raw output:', out);
        return res.status(500).json({ error: 'invalid analysis output', rawOutput: out });
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error', details: e.message });
  }
});

const port = 5000;
app.listen(port, () => console.log('Backend listening on', port));
