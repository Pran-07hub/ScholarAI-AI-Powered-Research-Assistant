# ScholarAI

## Prerequisites

Before starting, ensure you have the following installed on your system. If not, please download and install them:

- **Git**: [Download Git](https://git-scm.com/downloads) - Used for version control.
- **Python**: [Download Python](https://www.python.org/downloads/) (v3.8 or higher) - Required for the backend.
- **Node.js**: [Download Node.js](https://nodejs.org/) (v18 or higher) - Required for the frontend.

## Project Setup

1.  **Clone the repository:**

    Open your terminal or command prompt and run:

    ```bash
    git clone https://github.com/Priyanshu9382/scholarAI.git
    cd ScholarAI
    ```

## Frontend Setup

1.  Navigate to the `frontend` directory:

    ```bash
    cd frontend
    ```

2.  Install the dependencies:

    ```bash
    npm install
    ```

3.  Start the development server:

    ```bash
    npm run dev
    ```

    The frontend will be available at `http://localhost:3000`.

## Backend Setup

1.  Open a new terminal and navigate to the `backend` directory:

    ```bash
    cd backend
    ```

2.  Create a virtual environment:

    ```bash
    python3 -m venv venv
    ```

3.  Activate the virtual environment:

    -   **Linux/macOS:**
        ```bash
        source venv/bin/activate
        ```
    -   **Windows:**
        ```bash
        .\venv\Scripts\activate
        ```

4.  Install the required packages:

    ```bash
    pip install -r requirements.txt
    ```

5.  Start the FastAPI server:

    ```bash
    uvicorn main:app --reload --port 8000
    ```

    The backend will be available at `http://localhost:8000`.
    You can also view the interactive API documentation at `http://localhost:8000/docs`.

## Contribution Guide

We welcome contributions! Follow these steps to contribute effectively:

1.  **Pull the latest changes:**

    Before starting any work, always get the latest updates from the main branch to avoid conflicts.

    ```bash
    git pull origin main
    ```

2.  **Create a new branch:**

    You can use the terminal or VS Code's Git GUI.

    **Using Terminal:**
    ```bash
    git checkout -b <branch-name>
    ```

    **Using VS Code Git GUI:**
    - Click on the **Source Control** icon in the sidebar (or press `Ctrl+Shift+G`).
    - Click on the **... (More Actions)** menu top-right of the source control panel.
    - Select **Branch** > **Create Branch...**.
    - Enter your desired branch name and press Enter.

3.  **Make your changes:**

    Edit the code in your favorite editor and save your files.

4.  **Commit your changes:**

    Stage and commit your changes with a clear and descriptive message.

    ```bash
    git add .
    git commit -m "Add a descriptive message about your changes"
    ```

5.  **Push your changes:**

    Push your branch to the remote repository.

    ```bash
    git push origin <branch-name>
    ```

6.  **Create a Pull Request (PR):**

    -   Go to the repository on GitHub.
    -   You should see a prompt to "Compare & pull request". Click on it.
    -   Review your changes, add a title and description, and click "Create pull request".
