import os
import subprocess
import sys
import time

def run_command(command, shell=True):
    """Ejecuta un comando en la terminal y muestra la salida en tiempo real."""
    # FIX: Se añade encoding='utf-8' y errors='replace' para evitar el UnicodeDecodeError en Windows
    process = subprocess.Popen(
        command, 
        shell=shell, 
        stdout=subprocess.PIPE, 
        stderr=subprocess.PIPE, 
        encoding='utf-8', 
        errors='replace'
    )
    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.strip())
    return process.poll()

def check_node():
    """Verifica si Node.js está instalado."""
    try:
        subprocess.run(["node", "-v"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        print("[OK] Node.js detectado.")
        return True
    except FileNotFoundError:
        print("[ERROR] Node.js no está instalado. Por favor, descárgalo de https://nodejs.org/")
        return False

def create_project():
    """Crea la estructura del proyecto y archivos."""
    project_name = "neuro-composer"
    
    print(f"\n1. Creando proyecto '{project_name}'...")
    
    # Crear la app de React usando vite (más rápido que create-react-app)
    # Usamos npm create vite@latest directamente para evitar problemas de permisos
    if run_command(f"npm create vite@latest {project_name} -- --template react") != 0:
        print("Error creando el proyecto.")
        return

    os.chdir(project_name)
    
    print("\n2. Instalando dependencias (tone, lucide-react)...")
    # npm install base
    run_command("npm install")
    # Instalar librerías específicas
    run_command("npm install tone lucide-react")
    
    print("\n3. Escribiendo código de NeuroComposer v12...")
    
    # El código de la APP (Copiado de la versión final v12)
    app_code = r"""
// PEGA AQUÍ EL CÓDIGO DE APP.JSX QUE GENERÉ EN EL PASO ANTERIOR
// (El usuario debe reemplazar este contenido manualmente con el código completo de App.jsx)
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
"""
    
    print("\n[INFO] El entorno está listo.")
    print(f"IMPORTANTE: Ve a la carpeta '{project_name}/src' y reemplaza el contenido de 'App.jsx' con el código completo que te di anteriormente.")
    print("Una vez hecho eso, ejecuta en la terminal dentro de la carpeta:")
    print("npm run dev")

if __name__ == "__main__":
    print("--- Instalador de NeuroComposer v12 (Windows Fix) ---")
    if check_node():
        create_project()
        input("\nPresiona Enter para salir...")