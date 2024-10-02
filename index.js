// Importing the express module
const express = require('express');
const cors = require('cors'); // Import the cors package
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const app = express();
const video_path = 'videos/'
const upload = multer({ dest: video_path });
// app.use('/videos', express.static(path.join(__dirname, 'videos')));
// Middleware to parse JSON request bodies
app.set('trust proxy', true);  // This makes req.protocol honor the 'X-Forwarded-Proto' header

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Handles URL-encoded form data

// Handle POST requests to /submit
app.post('/submit', upload.single('video'), (req, res) => {
    const site_url = req.protocol + '://' + req.get('host'); // http://localhost:3000
    const videoFile = req.file;
    const { videoWidth, videoHeight } = req.body;

    const targetDir = path.join(__dirname, video_path);
    const targetFile = path.join(targetDir, videoFile.filename);

    const filename = 'recording';

    const getVideoResolution = (videoPath) => {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
                if (videoStream) {
                    resolve({ width: videoStream.width, height: videoStream.height });
                } else {
                    reject(new Error('No video stream found'));
                }
            }
            });
        });
    };

  // Function to process the video
  getVideoResolution(targetFile)
    .then(resolution => {
      const in_w = resolution.width;
      const in_h = resolution.height;
      const r = in_w / videoWidth;
      const heightToCrop = in_h - videoHeight * r;

      // Output files (for both webm and mp4 formats)
      const outputFileMp4 = path.join(targetDir, `${filename}.mp4`);
      const outputFileWebm = path.join(targetDir, `${filename}.webm`);

      // Process both mp4 and webm versions
      Promise.all([
        new Promise((resolve, reject) => {
          // Convert to MP4
          ffmpeg(targetFile)
            .videoFilter(`crop=in_w:in_h-${heightToCrop}:0:${heightToCrop}`)
            .on('end', () => resolve({ format: 'mp4', outputFile: outputFileMp4 }))
            .on('error', (err) => reject(err))
            .save(outputFileMp4);
        }),
        new Promise((resolve, reject) => {
          // Convert to WebM
          ffmpeg(targetFile)
            .videoFilter(`crop=in_w:in_h-${heightToCrop}:0:${heightToCrop}`)
            .on('end', () => resolve({ format: 'webm', outputFile: outputFileWebm }))
            .on('error', (err) => reject(err))
            .save(outputFileWebm);
        })
      ])
        .then((results) => {
          // Remove the original temp file after both processes are done
          fs.unlink(targetFile, (err) => {
            if (err) {
              console.error('Failed to delete temp file:', err);
            }
          });
          const links = [];
          for(const result of results) {
            // console.log(result);
            const name = filename + '.' + result['format'];
            links.push({
                'filename': name,
                'url': site_url + '/' + video_path + name
            });
          }
          // Return the output files' info
          res.json({
            status: 'success',
            message: 'Files resized, cropped, and processed successfully',
            links: links
          });
        })
        .catch(err => {
          console.error(err);
          res.status(500).json({ status: 'error', message: 'Error processing video files', error: err.message });
        });
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ status: 'error', message: 'Failed to retrieve video resolution', error: err.message });
    });
});
app.get('/videos/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'videos', filename);

    // Ensure the file exists
    fs.access(filePath, fs.constants.R_OK, (err) => {
        if (err) {
        return res.status(404).json({ status: 'error', message: 'File not found' });
        }
        
        // Force download of the file
        res.download(filePath, filename, (err) => {
        if (err) {
            console.error('Error sending the file:', err);
            res.status(500).send('Error downloading the file');
        }
        });
    });
});
// Handle all other methods (e.g., GET) with a 405 Method Not Allowed response
app.all('/submit', (req, res) => {
  res.status(405).send('Method Not Allowed');
});

// Start the server
const port = 3008;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});