'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Group, Modal, Stack, Switch, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, mensagemErro } from '@/lib/api';
import { cpfValido, mascaraCpf } from '@/lib/cpf';
import { mascaraTelefone, telefoneValido } from '@/lib/telefone';
import type { Funcionario } from '@/lib/types';

const formSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(150),
  matricula: z.string().trim().min(1, 'Obrigatório').max(40),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido')]),
  setor: z.string().max(100),
  cpf: z.string().refine((v) => v === '' || cpfValido(v), 'CPF inválido'),
  ramal: z.string().max(20),
  celular: z.string().refine((v) => v === '' || telefoneValido(v), 'Celular inválido'),
  ativo: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

export function FuncionarioModal({ inicial, onClose }: { inicial: Funcionario | 'novo' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editando = inicial && inicial !== 'novo' ? inicial : null;
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      nome: editando?.nome ?? '',
      matricula: editando?.matricula ?? '',
      email: editando?.email ?? '',
      setor: editando?.setor ?? '',
      cpf: mascaraCpf(editando?.cpf),
      ramal: editando?.ramal ?? '',
      celular: mascaraTelefone(editando?.celular),
      ativo: editando?.ativo ?? true,
    },
  });
  const salvar = handleSubmit(async (v) => {
    try {
      await api(editando ? `/api/funcionarios/${editando.id}` : '/api/funcionarios', { method: editando ? 'PUT' : 'POST', json: v });
      qc.invalidateQueries({ queryKey: ['funcionarios'] });
      qc.invalidateQueries({ queryKey: ['funcionario'] });
      qc.invalidateQueries({ queryKey: ['funcionarios-opcoes'] });
      notifications.show({ color: 'teal', message: 'Funcionário salvo' });
      onClose();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  });
  return (
    <Modal opened={!!inicial} onClose={onClose} title={editando ? 'Editar funcionário' : 'Novo funcionário'}>
      <form onSubmit={salvar}>
        <Stack>
          <TextInput label="Nome" withAsterisk {...register('nome')} error={formState.errors.nome?.message} />
          <TextInput label="Matrícula" withAsterisk {...register('matricula')} error={formState.errors.matricula?.message} />
          <TextInput label="E-mail" {...register('email')} error={formState.errors.email?.message} />
          <Controller
            control={control}
            name="cpf"
            render={({ field }) => (
              <TextInput
                label="CPF"
                placeholder="000.000.000-00"
                inputMode="numeric"
                value={field.value}
                onChange={(e) => field.onChange(mascaraCpf(e.currentTarget.value))}
                onBlur={field.onBlur}
                ref={field.ref}
                error={formState.errors.cpf?.message}
              />
            )}
          />
          <TextInput label="Setor" {...register('setor')} />
          <Group grow>
            <TextInput label="Ramal" {...register('ramal')} error={formState.errors.ramal?.message} />
            <Controller
              control={control}
              name="celular"
              render={({ field }) => (
                <TextInput
                  label="Celular / WhatsApp"
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  value={field.value}
                  onChange={(e) => field.onChange(mascaraTelefone(e.currentTarget.value))}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  error={formState.errors.celular?.message}
                />
              )}
            />
          </Group>
          <Controller control={control} name="ativo" render={({ field }) => <Switch label="Ativo" checked={field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              Salvar
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
